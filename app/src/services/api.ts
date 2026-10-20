import { normalizeBaseUrl } from '../logic';

export type Role = 'admin' | 'user';

export interface AuthUser {
  userId: string;
  displayName: string;
  role: Role;
}

export interface LoginResult {
  token: string;
  user: AuthUser;
}

export interface Announcement {
  id: number;
  title: string;
  body: string;
  pinned: boolean;
  authorName: string;
  createdAt: string;
  read: boolean;
}

export interface ScheduledMeeting {
  id: number;
  title: string;
  description: string;
  meetingNumber: string;
  passcode: string | null;
  startTime: string;
  durationMinutes: number;
  /** Empty = everyone. */
  assignees: string[];
  createdBy: string;
}

export interface NewAnnouncement {
  title: string;
  body: string;
  pinned: boolean;
}

export interface NewMeeting {
  title: string;
  description: string;
  meetingNumber: string;
  passcode: string | null;
  startTime: string;
  durationMinutes: number;
  assignees: string[];
}

/** What the announcements and schedule screens need from the backend. Faked in tests. */
export interface PortalApi {
  listAnnouncements(): Promise<Announcement[]>;
  createAnnouncement(input: NewAnnouncement): Promise<Announcement>;
  deleteAnnouncement(id: number): Promise<void>;
  markAnnouncementRead(id: number): Promise<void>;
  markAllAnnouncementsRead(): Promise<void>;
  listMeetings(): Promise<ScheduledMeeting[]>;
  createMeeting(input: NewMeeting): Promise<ScheduledMeeting>;
  deleteMeeting(id: number): Promise<void>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const toAnnouncement = (a: any): Announcement => ({
  id: a.id,
  title: a.title,
  body: a.body,
  pinned: !!a.pinned,
  authorName: a.author_name ?? a.author_id ?? '',
  createdAt: a.created_at,
  read: !!a.read,
});

const toMeeting = (m: any): ScheduledMeeting => ({
  id: m.id,
  title: m.title,
  description: m.description ?? '',
  meetingNumber: String(m.meeting_number),
  passcode: m.passcode ?? null,
  startTime: m.start_time,
  durationMinutes: m.duration_minutes,
  assignees: m.assignees ?? [],
  createdBy: m.created_by ?? '',
});

/** FastAPI sends `{detail: "text"}` or `{detail: [{msg, loc}]}`; turn either into a sentence. */
export function errorText(body: string): string {
  try {
    const d = JSON.parse(body)?.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) return d.map((x) => x?.msg ?? '').filter(Boolean).join('; ') || body;
  } catch {
    // not JSON
  }
  return body;
}

export interface ApiOptions {
  baseUrl: () => string;
  token: () => string | null;
  /** The server said the token is no good (expired, or the server was reset). */
  onUnauthorized?: () => void;
  /** Resolved at call time so tests can replace `global.fetch`. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class ApiClient implements PortalApi {
  constructor(private readonly o: ApiOptions) {}

  private async request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = this.o.token();
    if (auth && token) headers.Authorization = `Bearer ${token}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.o.timeoutMs ?? 15000);
    let res: Response;
    try {
      res = await (this.o.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a)))(
        `${normalizeBaseUrl(this.o.baseUrl())}${path}`,
        { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal },
      );
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw new Error('Network request failed (timeout)');
      throw e;
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const text = errorText(await res.text());
      if (res.status === 401 && auth) this.o.onUnauthorized?.();
      throw new ApiError(`${text} (${res.status})`, res.status);
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text?.();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async health(): Promise<boolean> {
    try {
      await this.request('GET', '/health', undefined, false);
      return true;
    } catch {
      return false;
    }
  }

  async login(userId: string, displayName: string, adminKey?: string): Promise<LoginResult> {
    const r = await this.request<any>(
      'POST',
      '/auth/login',
      { user_id: userId, display_name: displayName || null, admin_key: adminKey || null },
      false,
    );
    return {
      token: r.token,
      user: { userId: r.user.user_id, displayName: r.user.display_name, role: r.user.role === 'admin' ? 'admin' : 'user' },
    };
  }

  async zoomSignature(meetingNumber: string, role = 0): Promise<string> {
    const r = await this.request<{ signature: string }>('POST', '/zoom/signature', { meeting_number: meetingNumber, role });
    return r.signature;
  }

  async listAnnouncements(): Promise<Announcement[]> {
    return (await this.request<any[]>('GET', '/announcements')).map(toAnnouncement);
  }

  async createAnnouncement(input: NewAnnouncement): Promise<Announcement> {
    return toAnnouncement(await this.request('POST', '/announcements', input));
  }

  deleteAnnouncement(id: number): Promise<void> {
    return this.request('DELETE', `/announcements/${id}`);
  }

  markAnnouncementRead(id: number): Promise<void> {
    return this.request('POST', `/announcements/${id}/read`);
  }

  markAllAnnouncementsRead(): Promise<void> {
    return this.request('POST', '/announcements/read-all');
  }

  async listMeetings(): Promise<ScheduledMeeting[]> {
    return (await this.request<any[]>('GET', '/meetings')).map(toMeeting);
  }

  async createMeeting(input: NewMeeting): Promise<ScheduledMeeting> {
    return toMeeting(
      await this.request('POST', '/meetings', {
        title: input.title,
        description: input.description,
        meeting_number: input.meetingNumber,
        passcode: input.passcode,
        start_time: input.startTime,
        duration_minutes: input.durationMinutes,
        assignees: input.assignees,
      }),
    );
  }

  deleteMeeting(id: number): Promise<void> {
    return this.request('DELETE', `/meetings/${id}`);
  }
}
