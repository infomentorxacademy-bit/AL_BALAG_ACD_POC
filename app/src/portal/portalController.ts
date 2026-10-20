import { Store } from '../chat/store';
import type { Announcement, NewAnnouncement, NewMeeting, PortalApi, ScheduledMeeting } from '../services/api';

export interface PortalState {
  announcements: Announcement[];
  meetings: ScheduledMeeting[];
  /** True until the first load finishes (so screens show a spinner once, not on every refresh). */
  loading: boolean;
  error?: string;
  /** A just-arrived announcement to flash at the top of the app. */
  toast?: Announcement;
}

const initial: PortalState = { announcements: [], meetings: [], loading: true };

const POLL_MS = 30_000;

/** Announcements and scheduled meetings from the backend, kept fresh while the app is open. */
export class PortalController extends Store<PortalState> {
  private timer?: ReturnType<typeof setInterval>;
  private seen = new Set<number>();
  private firstLoadDone = false;
  private generation = 0;

  constructor(
    private readonly api: PortalApi,
    private readonly pollMs = POLL_MS,
  ) {
    super(initial);
  }

  get unreadAnnouncements(): number {
    return this.state.announcements.filter((a) => !a.read).length;
  }

  start(): void {
    this.stop();
    const gen = ++this.generation;
    this.refresh(gen);
    this.timer = setInterval(() => this.refresh(gen), this.pollMs);
  }

  stop(): void {
    this.generation++;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.seen = new Set();
    this.firstLoadDone = false;
    this.set(initial);
  }

  /** `gen` guards against a slow response arriving after sign-out (or sign-in as someone else). */
  async refresh(gen: number = this.generation): Promise<void> {
    try {
      const [announcements, meetings] = await Promise.all([this.api.listAnnouncements(), this.api.listMeetings()]);
      if (gen !== this.generation) return;
      const fresh = announcements.filter((a) => !a.read && !this.seen.has(a.id));
      const toast = this.firstLoadDone && fresh.length > 0 ? fresh[0] : this.state.toast;
      announcements.forEach((a) => this.seen.add(a.id));
      this.firstLoadDone = true;
      this.set({ announcements, meetings, loading: false, error: undefined, toast });
    } catch (e) {
      if (gen !== this.generation) return;
      this.patch({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  dismissToast(): void {
    this.patch({ toast: undefined });
  }

  async markRead(id: number): Promise<void> {
    const before = this.state.announcements;
    if (before.find((a) => a.id === id)?.read !== false) return;
    this.patch({ announcements: before.map((a) => (a.id === id ? { ...a, read: true } : a)) });
    try {
      await this.api.markAnnouncementRead(id);
    } catch {
      this.patch({ announcements: this.state.announcements.map((a) => (a.id === id ? { ...a, read: false } : a)) });
    }
  }

  async markAllRead(): Promise<void> {
    const before = this.state.announcements;
    this.patch({ announcements: before.map((a) => ({ ...a, read: true })) });
    try {
      await this.api.markAllAnnouncementsRead();
    } catch {
      this.patch({ announcements: before });
    }
  }

  async createAnnouncement(input: NewAnnouncement): Promise<void> {
    const created = await this.api.createAnnouncement(input);
    this.seen.add(created.id);
    await this.refresh();
  }

  async deleteAnnouncement(id: number): Promise<void> {
    await this.api.deleteAnnouncement(id);
    this.patch({ announcements: this.state.announcements.filter((a) => a.id !== id) });
  }

  async createMeeting(input: NewMeeting): Promise<void> {
    await this.api.createMeeting(input);
    await this.refresh();
  }

  async deleteMeeting(id: number): Promise<void> {
    await this.api.deleteMeeting(id);
    this.patch({ meetings: this.state.meetings.filter((m) => m.id !== id) });
  }
}
