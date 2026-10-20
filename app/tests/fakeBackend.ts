// An in-memory stand-in for the FastAPI backend: same URLs, same JSON, same status codes.
// Used with the real ApiClient so the app's networking code is exercised end to end.

interface Req {
  method: string;
  path: string;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  userId: string | null;
  role: 'admin' | 'user';
}

export interface Reply {
  status: number;
  json?: unknown;
}

export class FakeBackend {
  users = new Map<string, { display_name: string; role: 'admin' | 'user' }>();
  announcements: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  meetings: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  readBy = new Map<number, Set<string>>();
  nextId = 1;
  adminKey = 'letmein';
  /** Everything the app sent, for assertions. */
  calls: { method: string; path: string; body: unknown; auth: string | null }[] = [];
  /** When set, every request fails like an unreachable server. */
  down = false;
  /** Make the next request to this path answer with this status. */
  failNext = new Map<string, number>();

  seedAnnouncement(o: { title: string; body?: string; pinned?: boolean; at?: string; id?: number }): number {
    const id = o.id ?? this.nextId++;
    this.announcements.push({
      id,
      title: o.title,
      body: o.body ?? 'Body',
      pinned: !!o.pinned,
      author_id: 'admin',
      author_name: 'Admin',
      created_at: o.at ?? new Date().toISOString(),
    });
    return id;
  }

  seedMeeting(o: { title: string; startsInMin?: number; durationMin?: number; number?: string; passcode?: string | null; assignees?: string[] }): number {
    const id = this.nextId++;
    this.meetings.push({
      id,
      title: o.title,
      description: '',
      meeting_number: o.number ?? '81234567890',
      passcode: o.passcode === undefined ? 'abc123' : o.passcode,
      start_time: new Date(Date.now() + (o.startsInMin ?? 60) * 60000).toISOString(),
      duration_minutes: o.durationMin ?? 60,
      assignees: o.assignees ?? [],
      created_by: 'admin',
      created_at: new Date().toISOString(),
    });
    return id;
  }

  /** Install as the global fetch (React Native's fetch in the app under test). */
  install(): jest.Mock {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = jest.fn((url: string, init?: RequestInit) => this.fetch(url, init));
    (global as { fetch?: unknown }).fetch = fn;
    return fn;
  }

  fetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    if (this.down) throw new TypeError('Network request failed');
    const path = '/' + url.replace(/^https?:\/\/[^/]+\/?/, '');
    const headers = (init.headers ?? {}) as Record<string, string>;
    const auth = headers.Authorization ?? null;
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const method = init.method ?? 'GET';
    this.calls.push({ method, path, body, auth });

    const forced = this.failNext.get(path);
    if (forced) {
      this.failNext.delete(path);
      return this.respond({ status: forced, json: { detail: `forced ${forced}` } });
    }
    const m = /^Bearer tok-(.+)-(admin|user)$/.exec(auth ?? '');
    const reply = this.route({ method, path: path.split('?')[0], body, userId: m ? m[1] : null, role: m ? (m[2] as 'admin' | 'user') : 'user' });
    return this.respond(reply);
  };

  private respond(r: Reply): Response {
    const text = r.json === undefined ? '' : JSON.stringify(r.json);
    return { ok: r.status < 400, status: r.status, text: async () => text, json: async () => JSON.parse(text) } as unknown as Response;
  }

  private route(r: Req): Reply {
    const { method, path, body } = r;
    if (method === 'GET' && path === '/health') return { status: 200, json: { status: 'ok' } };
    if (method === 'POST' && path === '/auth/login') {
      const role = body.admin_key ? (body.admin_key === this.adminKey ? 'admin' : null) : 'user';
      if (!role) return { status: 403, json: { detail: 'Wrong admin key' } };
      const name = body.display_name || body.user_id;
      this.users.set(body.user_id, { display_name: name, role });
      return { status: 200, json: { token: `tok-${body.user_id}-${role}`, user: { user_id: body.user_id, display_name: name, role } } };
    }
    if (!r.userId) return { status: 401, json: { detail: 'Not authenticated' } };
    const admin = r.role === 'admin';

    if (method === 'POST' && path === '/zoom/signature') return { status: 200, json: { signature: 'JWT' } };

    if (method === 'GET' && path === '/announcements') {
      const sorted = [...this.announcements].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at));
      return { status: 200, json: sorted.map((a) => ({ ...a, read: this.readBy.get(a.id)?.has(r.userId!) ?? false })) };
    }
    if (method === 'POST' && path === '/announcements') {
      if (!admin) return { status: 403, json: { detail: 'Admins only' } };
      if (!body.title || !body.body) return { status: 422, json: { detail: [{ msg: 'field required' }] } };
      const id = this.nextId++;
      const row = { id, title: body.title, body: body.body, pinned: !!body.pinned, author_id: r.userId, author_name: this.users.get(r.userId)?.display_name ?? r.userId, created_at: new Date().toISOString() };
      this.announcements.push(row);
      return { status: 201, json: { ...row, read: false } };
    }
    if (method === 'POST' && path === '/announcements/read-all') {
      this.announcements.forEach((a) => this.markRead(a.id, r.userId!));
      return { status: 204 };
    }
    let m = /^\/announcements\/(\d+)\/read$/.exec(path);
    if (method === 'POST' && m) {
      if (!this.announcements.some((a) => a.id === +m![1])) return { status: 404, json: { detail: 'Not found' } };
      this.markRead(+m[1], r.userId);
      return { status: 204 };
    }
    m = /^\/announcements\/(\d+)$/.exec(path);
    if (method === 'DELETE' && m) {
      if (!admin) return { status: 403, json: { detail: 'Admins only' } };
      this.announcements = this.announcements.filter((a) => a.id !== +m![1]);
      return { status: 204 };
    }

    if (method === 'GET' && path === '/meetings') {
      const mine = this.meetings.filter((x) => admin || x.assignees.length === 0 || x.assignees.includes(r.userId));
      return { status: 200, json: [...mine].sort((a, b) => a.start_time.localeCompare(b.start_time)) };
    }
    if (method === 'POST' && path === '/meetings') {
      if (!admin) return { status: 403, json: { detail: 'Admins only' } };
      if (!/^\d{9,11}$/.test(body.meeting_number ?? '')) return { status: 422, json: { detail: [{ msg: 'meeting_number: bad format' }] } };
      const id = this.nextId++;
      const row = { id, description: '', ...body, created_by: r.userId, created_at: new Date().toISOString() };
      this.meetings.push(row);
      return { status: 201, json: row };
    }
    m = /^\/meetings\/(\d+)$/.exec(path);
    if (method === 'DELETE' && m) {
      if (!admin) return { status: 403, json: { detail: 'Admins only' } };
      this.meetings = this.meetings.filter((x) => x.id !== +m![1]);
      return { status: 204 };
    }
    return { status: 404, json: { detail: 'Not found' } };
  }

  private markRead(id: number, userId: string): void {
    if (!this.readBy.has(id)) this.readBy.set(id, new Set());
    this.readBy.get(id)!.add(userId);
  }
}
