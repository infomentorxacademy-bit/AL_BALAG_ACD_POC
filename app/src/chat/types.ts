// SDK-independent models, mirroring flutter_app/lib/features/chat/chat_models.dart.

export type DeliveryStatus = 'sending' | 'sent' | 'failed';
export type MessageKind = 'text' | 'image' | 'file';
export type ChatConnection = 'connecting' | 'online' | 'reconnecting' | 'offline';

/** A short quote of the message being replied to. */
export interface ReplyPreview {
  messageId: string;
  senderName: string;
  text: string;
}

export interface ChatMember {
  userId: string;
  nickname: string;
  profileUrl: string;
}

export const memberName = (m: ChatMember): string => m.nickname || m.userId;

/** A conversation (Sendbird group channel) as shown in the chat list. */
export interface ChatChannel {
  url: string;
  /** Ready-to-display name: the other person for a direct chat, the group name otherwise. */
  title: string;
  members: ChatMember[];
  memberCount: number;
  unreadCount: number;
  /** Preview of the newest message, e.g. "Alice: see you soon". */
  lastMessage?: string;
  /** Epoch milliseconds. */
  lastMessageAt?: number;
  isDirect: boolean;
  coverUrl: string;
}

/** One emoji and the users who reacted with it. */
export interface ChatReaction {
  key: string;
  userIds: string[];
}

export interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  /** Epoch milliseconds. */
  createdAt: number;
  isMine: boolean;
  status: DeliveryStatus;
  replyTo?: ReplyPreview;
  kind: MessageKind;
  attachmentUrl?: string;
  attachmentName?: string;
  /** Local file of an image still being uploaded. */
  localPath?: string;
  reactions: ChatReaction[];
  edited: boolean;
  /** Everyone else has read this (only meaningful for my own messages). */
  seen: boolean;
}

export function newMessage(partial: Partial<ChatMessage> & Pick<ChatMessage, 'id' | 'text'>): ChatMessage {
  return {
    senderId: 'me',
    senderName: 'Me',
    createdAt: Date.now(),
    isMine: false,
    status: 'sent',
    kind: 'text',
    reactions: [],
    edited: false,
    seen: false,
    ...partial,
  };
}

/** Only delivered messages have a server id that can be replied to, reacted to or edited. */
export const isDelivered = (m: ChatMessage): boolean =>
  m.status === 'sent' && /^\d+$/.test(m.id);
export const canReplyTo = (m: ChatMessage): boolean => isDelivered(m);
export const canEdit = (m: ChatMessage): boolean => m.isMine && isDelivered(m) && m.kind === 'text';
export const canDelete = (m: ChatMessage): boolean => m.isMine && isDelivered(m);

/** What to show in quotes and chat-list previews. */
export function previewText(m: ChatMessage): string {
  switch (m.kind) {
    case 'text':
      return m.text;
    case 'image':
      return '\u{1F4F7} Photo';
    case 'file':
      return `\u{1F4CE} ${m.attachmentName ?? 'File'}`;
  }
}

export const toReplyPreview = (m: ChatMessage): ReplyPreview => ({
  messageId: m.id,
  senderName: m.isMine ? 'You' : m.senderName,
  text: previewText(m),
});

export const reactedBy = (r: ChatReaction, userId?: string | null): boolean =>
  !!userId && r.userIds.includes(userId);

/** The reactions offered in the picker. */
export const quickReactions = ['\u{1F44D}', '❤️', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F64F}'];
