import type { ChatEvent, ChatService, Unsubscribe } from './chatService';
import { Store } from './store';
import type { ChatChannel, ChatConnection } from './types';

export type ChatPhase = 'idle' | 'loading' | 'ready' | 'error';

export interface ChannelListState {
  phase: ChatPhase;
  /** Newest activity first. */
  channels: ChatChannel[];
  connection: ChatConnection;
  error?: string;
}

const initial: ChannelListState = { phase: 'idle', channels: [], connection: 'connecting' };

/** A short, user-facing explanation of a chat failure. */
export function describeChatError(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e);
  if (/sendbird/i.test(text) || (e as { code?: number } | undefined)?.code) {
    return `Could not reach Sendbird. Check your connection and the App ID.\n${text}`;
  }
  return text;
}

/** Owns the chat connection and the list of conversations. */
export class ChannelListController extends Store<ChannelListState> {
  private unsubs: Unsubscribe[] = [];

  constructor(private readonly service: ChatService) {
    super(initial);
  }

  get totalUnread(): number {
    return this.state.channels.reduce((sum, c) => sum + c.unreadCount, 0);
  }

  async start(userId: string, nickname: string): Promise<void> {
    this.cancelSubscriptions();
    this.set({ ...initial, phase: 'loading' });
    try {
      this.unsubs.push(this.service.onConnection((connection) => this.patch({ connection })));
      await this.service.connect(userId, nickname);
      // Subscribe before loading so nothing that arrives in between is missed.
      this.unsubs.push(this.service.onEvent((e) => this.onEvent(e)));
      await this.service.joinDemoRoom();
      const loaded = await this.service.loadChannels();
      this.set({
        ...this.state,
        phase: 'ready',
        channels: sorted(mergeById(this.state.channels, loaded)),
        connection: 'online',
        error: undefined,
      });
    } catch (e) {
      this.set({ ...this.state, phase: 'error', error: describeChatError(e) });
    }
  }

  async stop(): Promise<void> {
    this.cancelSubscriptions();
    this.set(initial);
    try {
      await this.service.disconnect();
    } catch {
      // Disconnecting is best effort.
    }
  }

  /** Pull-to-refresh. Keeps the current list on screen if it fails. */
  async refresh(): Promise<void> {
    try {
      const loaded = await this.service.loadChannels();
      this.patch({ channels: sorted(loaded), error: undefined });
    } catch (e) {
      this.patch({ error: describeChatError(e) });
    }
  }

  /** Starts a direct chat (one id) or a group (several). Throws so the form can show the reason. */
  async createChannel(userIds: string[], name?: string): Promise<ChatChannel> {
    const channel = await this.service.createChannel(userIds, name);
    this.upsert(channel);
    return channel;
  }

  async leave(channelUrl: string): Promise<void> {
    await this.service.leaveChannel(channelUrl);
    this.patch({ channels: this.state.channels.filter((c) => c.url !== channelUrl) });
  }

  /** Called when a conversation is opened: its unread badge goes away. */
  clearUnread(channelUrl: string): void {
    this.patch({
      channels: this.state.channels.map((c) => (c.url === channelUrl ? { ...c, unreadCount: 0 } : c)),
    });
  }

  private onEvent(event: ChatEvent): void {
    if (event.type === 'channelChanged') this.upsert(event.channel);
    if (event.type === 'channelRemoved') {
      this.patch({ channels: this.state.channels.filter((c) => c.url !== event.channelUrl) });
    }
  }

  private upsert(channel: ChatChannel): void {
    this.patch({ channels: sorted(mergeById(this.state.channels, [channel])) });
  }

  private cancelSubscriptions(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
  }
}

/** Adds [incoming] to [existing]; a channel in both takes the incoming (newer) version. */
function mergeById(existing: ChatChannel[], incoming: ChatChannel[]): ChatChannel[] {
  const byUrl = new Map(existing.map((c) => [c.url, c]));
  incoming.forEach((c) => byUrl.set(c.url, c));
  return [...byUrl.values()];
}

function sorted(list: ChatChannel[]): ChatChannel[] {
  return [...list].sort((a, b) => {
    if (a.lastMessageAt === undefined && b.lastMessageAt === undefined) return 0;
    if (a.lastMessageAt === undefined) return 1;
    if (b.lastMessageAt === undefined) return -1;
    return b.lastMessageAt - a.lastMessageAt;
  });
}
