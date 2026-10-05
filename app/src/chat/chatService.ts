import type { ChatChannel, ChatConnection, ChatMessage, ReplyPreview } from './types';

/** Something that happened on the server, pushed to the app in real time. */
export type ChatEvent =
  | { type: 'messageReceived'; channelUrl: string; message: ChatMessage }
  | { type: 'messageUpdated'; channelUrl: string; message: ChatMessage }
  | { type: 'messageDeleted'; channelUrl: string; messageId: string }
  | { type: 'reactionChanged'; channelUrl: string; messageId: string; key: string; userId: string; added: boolean }
  /** Names of the other people currently typing. */
  | { type: 'typingChanged'; channelUrl: string; names: string[] }
  /** The ids of my messages that everyone else has now read. */
  | { type: 'readReceiptsChanged'; channelUrl: string; seenMessageIds: string[] }
  /** A channel was created or changed (new last message, unread count, members, ...). */
  | { type: 'channelChanged'; channelUrl: string; channel: ChatChannel }
  | { type: 'channelRemoved'; channelUrl: string };

export type Unsubscribe = () => void;

/** What the app needs from a chat backend. Implemented by Sendbird; faked in tests. */
export interface ChatService {
  readonly currentUserId: string | null;
  onEvent(listener: (event: ChatEvent) => void): Unsubscribe;
  onConnection(listener: (state: ChatConnection) => void): Unsubscribe;

  connect(userId: string, nickname?: string): Promise<void>;
  disconnect(): Promise<void>;

  /** Makes sure the shared public demo room exists and that the current user is in it. */
  joinDemoRoom(): Promise<void>;
  /** My conversations, newest activity first. */
  loadChannels(): Promise<ChatChannel[]>;
  /** One id = direct chat (an existing one is re-used); several = group named [name]. */
  createChannel(userIds: string[], name?: string): Promise<ChatChannel>;
  leaveChannel(channelUrl: string): Promise<void>;

  /** Up to [limit] messages older than [before] (or the newest ones), oldest first. */
  loadMessages(channelUrl: string, opts?: { before?: number; limit?: number }): Promise<ChatMessage[]>;
  sendText(channelUrl: string, text: string, replyTo?: ReplyPreview): Promise<ChatMessage>;
  sendImage(channelUrl: string, file: { uri: string; name: string; type: string; size: number }, replyTo?: ReplyPreview): Promise<ChatMessage>;
  editMessage(channelUrl: string, messageId: string, newText: string): Promise<ChatMessage>;
  deleteMessage(channelUrl: string, messageId: string): Promise<void>;
  setReaction(channelUrl: string, messageId: string, key: string, on: boolean): Promise<void>;
  markRead(channelUrl: string): Promise<void>;
  /** Tells the others that I started or stopped typing. */
  setTyping(channelUrl: string, typing: boolean): void;
}

/** The demo room every user joins. */
export const DEMO_CHANNEL_URL = 'poc-demo-room';
export const DEMO_CHANNEL_NAME = 'POC Demo Room';
