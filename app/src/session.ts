import { Store } from './chat/store';
import { config } from './config';
import { normalizeBaseUrl } from './logic';
import type { Role } from './services/api';
import { clearSession, loadServerUrl, loadSession, saveServerUrl, saveSession } from './storage';
import type { Session } from './storage';

export interface SessionState {
  /** undefined = still reading storage, null = signed out. */
  session: Session | null | undefined;
  serverUrl: string;
}

/** Who is signed in and which backend they talk to. Everything else (API calls, chat) reads from here. */
export class SessionStore extends Store<SessionState> {
  constructor() {
    super({ session: undefined, serverUrl: config.apiBaseUrl });
  }

  get token(): string | null {
    return this.state.session?.token ?? null;
  }

  get role(): Role {
    return this.state.session?.role ?? 'user';
  }

  get isAdmin(): boolean {
    return this.role === 'admin';
  }

  async load(): Promise<Session | null> {
    const [session, url] = await Promise.all([loadSession(), loadServerUrl()]);
    this.set({ session, serverUrl: url ? normalizeBaseUrl(url) : this.state.serverUrl });
    return session;
  }

  async signIn(session: Session): Promise<void> {
    await saveSession(session);
    this.patch({ session });
  }

  async signOut(): Promise<void> {
    await clearSession();
    this.patch({ session: null });
  }

  async setServerUrl(input: string): Promise<string> {
    const url = normalizeBaseUrl(input);
    await saveServerUrl(url).catch(() => undefined);
    this.patch({ serverUrl: url });
    return url;
  }
}
