import type { ChatEvent, ChatService, Unsubscribe } from '../src/chat/chatService';
import type { ZoomWindowApi } from '../src/meeting/activeMeeting';
import { newMessage } from '../src/chat/types';
import type { ChatChannel, ChatConnection, ChatMessage, ReplyPreview } from '../src/chat/types';

export const DEMO = 'poc-demo-room';

export function chan(p: Partial<ChatChannel> = {}): ChatChannel {
  return {
    url: DEMO,
    title: 'POC Demo Room',
    members: [],
    memberCount: 3,
    unreadCount: 0,
    lastMessage: 'bob: Welcome to the room',
    lastMessageAt: Date.UTC(2026, 0, 1, 12),
    isDirect: false,
    coverUrl: '',
    ...p,
  };
}

/** A message from bob (or from alice when [mine]). */
export function msg(
  id: string,
  text: string,
  o: { mine?: boolean; at?: number; sender?: string; reactions?: ChatMessage['reactions'] } = {},
): ChatMessage {
  const mine = o.mine ?? false;
  return newMessage({
    id,
    text,
    senderId: mine ? 'alice' : (o.sender ?? 'bob'),
    senderName: mine ? 'Me' : (o.sender ?? 'bob'),
    createdAt: o.at ?? Date.UTC(2026, 0, 1, 12),
    isMine: mine,
    reactions: o.reactions ?? [],
  });
}

export class FakeChatService implements ChatService {
  currentUserId: string | null = 'alice';
  channels: ChatChannel[] = [chan()];
  messagesByChannel: Record<string, ChatMessage[]> = {};

  connectError?: Error;
  loadChannelsError?: Error;
  loadMessagesError?: Error;
  sendError?: Error;
  editError?: Error;
  deleteError?: Error;
  reactionError?: Error;
  createError?: Error;

  sent: string[] = [];
  replies: (ReplyPreview | undefined)[] = [];
  images: string[] = [];
  edits: { id: string; text: string }[] = [];
  deleted: string[] = [];
  reactions: { id: string; key: string; on: boolean }[] = [];
  readMarks: string[] = [];
  typingCalls: boolean[] = [];
  created: { ids: string[]; name?: string }[] = [];
  left: string[] = [];
  disconnected = false;
  joinedDemo = false;
  private serverId = 1000;

  private eventListeners = new Set<(e: ChatEvent) => void>();
  private connectionListeners = new Set<(c: ChatConnection) => void>();

  set history(messages: ChatMessage[]) {
    this.messagesByChannel[DEMO] = messages;
  }

  onEvent(l: (e: ChatEvent) => void): Unsubscribe {
    this.eventListeners.add(l);
    return () => this.eventListeners.delete(l);
  }
  onConnection(l: (c: ChatConnection) => void): Unsubscribe {
    this.connectionListeners.add(l);
    return () => this.connectionListeners.delete(l);
  }
  emit(e: ChatEvent): void {
    this.eventListeners.forEach((l) => l(e));
  }
  emitConnection(c: ChatConnection): void {
    this.connectionListeners.forEach((l) => l(c));
  }

  async connect(): Promise<void> {
    if (this.connectError) throw this.connectError;
  }
  async disconnect(): Promise<void> {
    this.disconnected = true;
  }
  async joinDemoRoom(): Promise<void> {
    this.joinedDemo = true;
  }
  async loadChannels(): Promise<ChatChannel[]> {
    if (this.loadChannelsError) throw this.loadChannelsError;
    return this.channels;
  }
  async createChannel(userIds: string[], name?: string): Promise<ChatChannel> {
    if (this.createError) throw this.createError;
    this.created.push({ ids: userIds, name });
    return chan({
      url: `new-${this.created.length}`,
      title: userIds.length === 1 ? userIds[0] : (name ?? userIds.join(', ')),
      isDirect: userIds.length === 1,
      lastMessage: undefined,
      lastMessageAt: Date.UTC(2026, 0, 2),
    });
  }
  async leaveChannel(url: string): Promise<void> {
    this.left.push(url);
  }

  async loadMessages(url: string, opts: { before?: number; limit?: number } = {}): Promise<ChatMessage[]> {
    if (this.loadMessagesError) throw this.loadMessagesError;
    const limit = opts.limit ?? 30;
    const all = [...(this.messagesByChannel[url] ?? [])].sort((a, b) => a.createdAt - b.createdAt);
    const older = opts.before === undefined ? all : all.filter((m) => m.createdAt < opts.before!);
    return older.length <= limit ? older : older.slice(older.length - limit);
  }

  private echo(text: string, replyTo: ReplyPreview | undefined, kind: ChatMessage['kind'] = 'text'): ChatMessage {
    const id = String(++this.serverId);
    return newMessage({
      id,
      text,
      senderId: this.currentUserId ?? 'me',
      isMine: true,
      replyTo,
      kind,
      attachmentUrl: kind === 'image' ? `https://example.com/${id}.jpg` : undefined,
    });
  }

  async sendText(_url: string, text: string, replyTo?: ReplyPreview): Promise<ChatMessage> {
    if (this.sendError) throw this.sendError;
    this.sent.push(text);
    this.replies.push(replyTo);
    return this.echo(text, replyTo);
  }
  async sendImage(_url: string, file: { uri: string }, replyTo?: ReplyPreview): Promise<ChatMessage> {
    if (this.sendError) throw this.sendError;
    this.images.push(file.uri);
    return this.echo('', replyTo, 'image');
  }
  async editMessage(_url: string, id: string, text: string): Promise<ChatMessage> {
    if (this.editError) throw this.editError;
    this.edits.push({ id, text });
    return newMessage({ id, text, senderId: 'alice', isMine: true, edited: true });
  }
  async deleteMessage(_url: string, id: string): Promise<void> {
    if (this.deleteError) throw this.deleteError;
    this.deleted.push(id);
  }
  async setReaction(_url: string, id: string, key: string, on: boolean): Promise<void> {
    if (this.reactionError) throw this.reactionError;
    this.reactions.push({ id, key, on });
  }
  async markRead(url: string): Promise<void> {
    this.readMarks.push(url);
  }
  setTyping(_url: string, typing: boolean): void {
    this.typingCalls.push(typing);
  }
}

export const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Stands in for the native Zoom SDK's window controls. */
export class FakeZoomWindow implements ZoomWindowApi {
  overlay = true;
  overlayError = false;
  overlaySettingsOpened = 0;
  returned = 0;
  returnError = false;
  meetingState = 'InMeeting';
  stateListeners = new Set<(s: string) => void>();
  minListeners = new Set<() => void>();

  async canDrawOverlays() {
    if (this.overlayError) throw new Error('no native');
    return this.overlay;
  }
  async requestOverlayPermission() {
    this.overlaySettingsOpened++;
  }
  async returnToMeeting() {
    if (this.returnError) throw new Error('gone');
    this.returned++;
  }
  async getMeetingState() {
    return this.meetingState;
  }
  onState(l: (s: string) => void) {
    this.stateListeners.add(l);
    return () => this.stateListeners.delete(l);
  }
  onMinimized(l: () => void) {
    this.minListeners.add(l);
    return () => this.minListeners.delete(l);
  }
  emitState(s: string) {
    this.stateListeners.forEach((l) => l(s));
  }
  emitMinimized() {
    this.minListeners.forEach((l) => l());
  }
}

