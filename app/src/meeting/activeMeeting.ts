import { Store } from '../chat/store';

// Tracks the one Zoom meeting that may be running while the user moves around the app.
// Zoom shows its own full-screen meeting UI; when the user minimizes it, Zoom shows a small floating
// window (needs the "Display over other apps" permission) and the app is usable again. This controller
// remembers that a meeting is running so the app can offer "Return to meeting" from any screen.

export type Unsubscribe = () => void;

export interface ActiveSession {
  jwtToken: string;
  meetingNumber: string;
  password: string;
  userName: string;
}

export type MeetingPhase = 'idle' | 'joining' | 'active';

export interface ActiveMeetingState {
  phase: MeetingPhase;
  session?: ActiveSession;
  /** Set when the last attempt failed, so the form can explain why. */
  error?: string;
}

/** The native side (Zoom SDK). Faked in tests. */
export interface ZoomWindowApi {
  canDrawOverlays(): Promise<boolean>;
  requestOverlayPermission(): Promise<void>;
  returnToMeeting(): Promise<void>;
  getMeetingState(): Promise<string>;
  onState(listener: (state: string) => void): Unsubscribe;
  onMinimized(listener: () => void): Unsubscribe;
}

const initial: ActiveMeetingState = { phase: 'idle' };

/** The text Zoom sends for "a join attempt succeeded" (Android and iOS spellings). */
export const isJoinSuccess = (result: unknown): boolean => /SUCCESS/i.test(String(result));

const isInMeeting = (s: string) => /InMeeting/i.test(s);
const isOver = (s: string) => /(^|_)(Ended|Idle|Failed)$/i.test(s);

export class ActiveMeetingController extends Store<ActiveMeetingState> {
  private unsubs: Unsubscribe[] = [];
  private seenInMeeting = false;

  constructor(private readonly api: ZoomWindowApi) {
    super(initial);
  }

  get isRunning(): boolean {
    return this.state.phase !== 'idle';
  }

  /** Asks (at most once per join) whether the floating window may be shown. */
  async overlayAllowed(): Promise<boolean> {
    try {
      return await this.api.canDrawOverlays();
    } catch {
      return true; // Unknown: do not nag.
    }
  }

  openOverlaySettings(): Promise<void> {
    return this.api.requestOverlayPermission();
  }

  /** Called with the token once the user taps Join. The hidden Zoom host performs the actual join. */
  start(session: ActiveSession): void {
    this.stop();
    this.seenInMeeting = false;
    this.set({ phase: 'joining', session });
    this.unsubs.push(this.api.onState((s) => this.onState(s)));
    this.unsubs.push(this.api.onMinimized(() => this.onMinimized()));
  }

  /** The result of `joinMeeting` (not the same thing as being in the meeting yet). */
  onJoinResult(result: unknown): void {
    if (this.state.phase === 'idle') return;
    if (!isJoinSuccess(result)) this.fail(`Zoom could not join the meeting (${String(result)}).`);
  }

  fail(message: string): void {
    this.stop();
    this.set({ phase: 'idle', error: message });
  }

  private onState(state: string): void {
    if (this.state.phase === 'idle') return;
    if (isInMeeting(state)) {
      this.seenInMeeting = true;
      this.patch({ phase: 'active', error: undefined });
    } else if (isOver(state)) {
      // Zoom can report "Idle" before the join has started: only believe it once we were in the meeting.
      if (this.seenInMeeting || /Ended|Failed/i.test(state)) this.end();
    }
  }

  private onMinimized(): void {
    if (this.state.phase !== 'idle') {
      this.seenInMeeting = true;
      this.patch({ phase: 'active' });
    }
  }

  /** Back to full screen. */
  async returnToMeeting(): Promise<void> {
    if (!this.isRunning) return;
    try {
      await this.api.returnToMeeting();
    } catch {
      // The meeting may have just ended; the state check below cleans up.
      await this.syncWithZoom();
    }
  }

  /** Call when the app comes back to the foreground: events may have been missed. */
  async syncWithZoom(): Promise<void> {
    if (!this.isRunning) return;
    let state: string;
    try {
      state = await this.api.getMeetingState();
    } catch {
      return;
    }
    if (isInMeeting(state)) {
      this.seenInMeeting = true;
      this.patch({ phase: 'active' });
    } else if (this.seenInMeeting && isOver(state)) {
      this.end();
    }
  }

  /** The meeting is over (or was left). */
  end(): void {
    this.stop();
    this.set(initial);
  }

  private stop(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
  }

  clearError(): void {
    this.patch({ error: undefined });
  }
}
