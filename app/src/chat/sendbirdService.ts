import SendbirdChat, { ConnectionHandler } from '@sendbird/chat';
import type { SendbirdChatWith } from '@sendbird/chat';
import { GroupChannelHandler, GroupChannelListOrder, GroupChannelModule, MyMemberStateFilter } from '@sendbird/chat/groupChannel';
import type { GroupChannel } from '@sendbird/chat/groupChannel';
import { ReactionEventOperation, ReplyType } from '@sendbird/chat/message';
import type { BaseMessage, UserMessage } from '@sendbird/chat/message';

import type { ChatEvent, ChatService, Unsubscribe } from './chatService';
import { DEMO_CHANNEL_NAME, DEMO_CHANNEL_URL } from './chatService';
import { memberName } from './types';
import type { ChatChannel, ChatConnection, ChatMessage, ReplyPreview } from './types';

type Sendbird = SendbirdChatWith<[GroupChannelModule]>;

const HANDLER_KEY = 'poc-chat-handler';

/** Sendbird implementation of [ChatService]. All Sendbird types stay inside this file. */
export class SendbirdChatService implements ChatService {
  private sb: Sendbird | null = null;
  private channels = new Map<string, GroupChannel>();
  /** Messages we have seen, so later calls (react, delete, ...) can find them by id. */
  private messages = new Map<string, Map<number, BaseMessage>>();
  private eventListeners = new Set<(e: ChatEvent) => void>();
  private connectionListeners = new Set<(c: ChatConnection) => void>();

  constructor(private readonly appId: string) {}

  get currentUserId(): string | null {
    return this.sb?.currentUser?.userId ?? null;
  }

  onEvent(listener: (e: ChatEvent) => void): Unsubscribe {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onConnection(listener: (c: ChatConnection) => void): Unsubscribe {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  private emit(e: ChatEvent): void {
    this.eventListeners.forEach((l) => l(e));
  }
  private emitConnection(c: ChatConnection): void {
    this.connectionListeners.forEach((l) => l(c));
  }

  private get client(): Sendbird {
    if (!this.sb) throw new Error('Sendbird is not connected.');
    return this.sb;
  }

  // ---------------------------------------------------------------- connection

  async connect(userId: string, nickname?: string): Promise<void> {
    if (!this.appId) throw new Error('Sendbird App ID is not set (EXPO_PUBLIC_SENDBIRD_APP_ID).');
    if (!this.sb) {
      this.sb = SendbirdChat.init({ appId: this.appId, modules: [new GroupChannelModule()] }) as Sendbird;
      this.sb.addConnectionHandler(
        HANDLER_KEY,
        new ConnectionHandler({
          onConnected: () => this.emitConnection('online'),
          onReconnectStarted: () => this.emitConnection('reconnecting'),
          onReconnectSucceeded: () => this.emitConnection('online'),
          onReconnectFailed: () => this.emitConnection('offline'),
          onConnectionLost: () => this.emitConnection('offline'),
          onDisconnected: () => this.emitConnection('offline'),
        }),
      );
    }
    this.sb.groupChannel.addGroupChannelHandler(HANDLER_KEY, this.buildHandler());
    this.emitConnection('connecting');
    await this.sb.connect(userId);
    if (nickname && nickname !== this.sb.currentUser?.nickname) {
      await this.sb.updateCurrentUserInfo({ nickname });
    }
    this.emitConnection('online');
  }

  async disconnect(): Promise<void> {
    this.sb?.groupChannel.removeGroupChannelHandler(HANDLER_KEY);
    this.channels.clear();
    this.messages.clear();
    await this.sb?.disconnect();
  }

  // ------------------------------------------------------------------ channels

  async joinDemoRoom(): Promise<void> {
    const gc = this.client.groupChannel;
    let channel: GroupChannel;
    try {
      channel = await gc.getChannel(DEMO_CHANNEL_URL);
    } catch {
      // Not found: the first user to arrive creates the shared room.
      channel = await gc.createChannel({
        channelUrl: DEMO_CHANNEL_URL,
        name: DEMO_CHANNEL_NAME,
        isPublic: true,
        isDistinct: false,
      });
    }
    if (channel.myMemberState !== 'joined') await channel.join();
    this.channels.set(channel.url, channel);
  }

  async loadChannels(): Promise<ChatChannel[]> {
    const query = this.client.groupChannel.createMyGroupChannelListQuery({
      limit: 20,
      order: GroupChannelListOrder.LATEST_LAST_MESSAGE,
      myMemberStateFilter: MyMemberStateFilter.JOINED,
      includeEmpty: true,
    });
    const result: GroupChannel[] = [];
    // A few pages are plenty for a demo.
    for (let page = 0; page < 5 && query.hasNext; page++) {
      result.push(...(await query.next()));
    }
    result.forEach((c) => this.channels.set(c.url, c));
    return result.map((c) => this.mapChannel(c));
  }

  async createChannel(userIds: string[], name?: string): Promise<ChatChannel> {
    const channel = await this.client.groupChannel.createChannel({
      invitedUserIds: userIds,
      // One other person = a direct chat; Sendbird returns the existing one if there is one.
      isDistinct: userIds.length === 1,
      ...(userIds.length > 1 && name?.trim() ? { name: name.trim() } : {}),
    });
    this.channels.set(channel.url, channel);
    return this.mapChannel(channel);
  }

  async leaveChannel(channelUrl: string): Promise<void> {
    const channel = await this.channel(channelUrl);
    await channel.leave();
    this.channels.delete(channelUrl);
    this.messages.delete(channelUrl);
    this.emit({ type: 'channelRemoved', channelUrl });
  }

  private async channel(url: string): Promise<GroupChannel> {
    const cached = this.channels.get(url);
    if (cached) return cached;
    const fetched = await this.client.groupChannel.getChannel(url);
    this.channels.set(url, fetched);
    return fetched;
  }

  // ------------------------------------------------------------------ messages

  async loadMessages(channelUrl: string, opts: { before?: number; limit?: number } = {}): Promise<ChatMessage[]> {
    const channel = await this.channel(channelUrl);
    const raw = await channel.getMessagesByTimestamp(opts.before ?? Date.now(), {
      prevResultSize: opts.limit ?? 30,
      nextResultSize: 0,
      isInclusive: false,
      reverse: false,
      // Include the quoted parent of replies so they render with their context.
      includeParentMessageInfo: true,
      replyType: ReplyType.ALL,
      includeReactions: true,
    });
    const mapped: ChatMessage[] = [];
    for (const m of raw) {
      this.remember(channelUrl, m);
      const message = this.mapMessage(m, channel);
      if (message) mapped.push(message);
    }
    return mapped.sort((a, b) => a.createdAt - b.createdAt);
  }

  async sendText(channelUrl: string, text: string, replyTo?: ReplyPreview): Promise<ChatMessage> {
    const channel = await this.channel(channelUrl);
    const parentMessageId = replyTo ? Number(replyTo.messageId) : NaN;
    return new Promise<ChatMessage>((resolve, reject) => {
      channel
        .sendUserMessage({
          message: text,
          // Show the reply in the main conversation, not only inside a thread.
          ...(Number.isFinite(parentMessageId) ? { parentMessageId, replyToChannel: true } : {}),
        })
        .onSucceeded((m) => this.finishSend(channel, m, resolve, reject))
        .onFailed(reject);
      channel.endTyping().catch(() => undefined);
    });
  }

  async sendImage(
    channelUrl: string,
    file: { uri: string; name: string; type: string; size: number },
    replyTo?: ReplyPreview,
  ): Promise<ChatMessage> {
    const channel = await this.channel(channelUrl);
    const parentMessageId = replyTo ? Number(replyTo.messageId) : NaN;
    return new Promise<ChatMessage>((resolve, reject) => {
      channel
        .sendFileMessage({
          file,
          ...(Number.isFinite(parentMessageId) ? { parentMessageId, replyToChannel: true } : {}),
        })
        .onSucceeded((m) => this.finishSend(channel, m, resolve, reject))
        .onFailed(reject);
    });
  }

  private finishSend(
    channel: GroupChannel,
    m: BaseMessage,
    resolve: (v: ChatMessage) => void,
    reject: (e: unknown) => void,
  ): void {
    const mapped = this.mapMessage(m, channel);
    if (!mapped) return reject(new Error('Unsupported message type'));
    this.remember(channel.url, m);
    resolve(mapped);
  }

  async editMessage(channelUrl: string, messageId: string, newText: string): Promise<ChatMessage> {
    const channel = await this.channel(channelUrl);
    const updated = await channel.updateUserMessage(Number(messageId), { message: newText });
    this.remember(channelUrl, updated);
    const mapped = this.mapMessage(updated, channel);
    if (!mapped) throw new Error('Unsupported message type');
    return mapped;
  }

  async deleteMessage(channelUrl: string, messageId: string): Promise<void> {
    const channel = await this.channel(channelUrl);
    const message = this.messages.get(channelUrl)?.get(Number(messageId));
    if (!message) throw new Error('Message not loaded');
    await channel.deleteMessage(message);
    this.messages.get(channelUrl)?.delete(Number(messageId));
  }

  async setReaction(channelUrl: string, messageId: string, key: string, on: boolean): Promise<void> {
    const channel = await this.channel(channelUrl);
    const message = this.messages.get(channelUrl)?.get(Number(messageId));
    if (!message) throw new Error('Message not loaded');
    if (on) await channel.addReaction(message, key);
    else await channel.deleteReaction(message, key);
  }

  async markRead(channelUrl: string): Promise<void> {
    const channel = await this.channel(channelUrl);
    await channel.markAsRead();
  }

  setTyping(channelUrl: string, typing: boolean): void {
    const channel = this.channels.get(channelUrl);
    if (!channel) return;
    (typing ? channel.startTyping() : channel.endTyping()).catch(() => undefined);
  }

  // ------------------------------------------------------------------- mapping

  private remember(channelUrl: string, m: BaseMessage): void {
    let byId = this.messages.get(channelUrl);
    if (!byId) this.messages.set(channelUrl, (byId = new Map()));
    byId.set(m.messageId, m);
  }

  private mapChannel(ch: GroupChannel): ChatChannel {
    const myId = this.currentUserId;
    const others = ch.members.filter((m) => m.userId !== myId);
    const isDirect = ch.isDistinct && ch.members.length <= 2;
    const name = (m: { nickname: string; userId: string }) => m.nickname || m.userId;

    let title: string;
    if (isDirect && others.length > 0) title = name(others[0]);
    else if (ch.name && ch.name !== 'Group Channel') title = ch.name;
    else if (others.length > 0) title = others.map(name).join(', ');
    else title = 'Chat';

    const last = ch.lastMessage;
    let preview: string | undefined;
    if (last) {
      const who =
        senderOf(last)?.userId === myId ? 'You: ' : !isDirect ? `${senderOf(last) ? name(senderOf(last)!) : ''}: ` : '';
      preview = `${who}${previewOf(last)}`;
    }
    return {
      url: ch.url,
      title,
      members: ch.members.map((m) => ({ userId: m.userId, nickname: m.nickname, profileUrl: m.profileUrl })),
      memberCount: ch.memberCount,
      unreadCount: ch.unreadMessageCount,
      lastMessage: preview,
      lastMessageAt: last?.createdAt ?? ch.createdAt,
      isDirect,
      coverUrl: ch.coverUrl,
    };
  }

  private mapMessage(m: BaseMessage, channel: GroupChannel): ChatMessage | null {
    const myId = this.currentUserId;
    const sender = senderOf(m);
    const senderId = sender?.userId ?? '';
    const mine = !!senderId && senderId === myId;

    let kind: ChatMessage['kind'] = 'text';
    let attachmentUrl: string | undefined;
    let attachmentName: string | undefined;
    if (m.isFileMessage()) {
      kind = (m.type ?? '').startsWith('image/') ? 'image' : 'file';
      attachmentUrl = m.url;
      attachmentName = m.name;
    } else if (!m.isUserMessage()) {
      return null; // Admin/system messages are not shown.
    }

    const parent = m.parentMessage as BaseMessage | null | undefined;
    return {
      id: String(m.messageId),
      text: m.message ?? '',
      senderId,
      senderName: sender ? memberName({ userId: sender.userId, nickname: sender.nickname, profileUrl: '' }) : senderId,
      createdAt: m.createdAt,
      isMine: mine,
      status: 'sent',
      replyTo: parent ? this.mapParent(parent, myId) : undefined,
      kind,
      attachmentUrl,
      attachmentName,
      reactions: (m.reactions ?? [])
        .filter((r) => !r.isEmpty)
        .map((r) => ({ key: r.key, userIds: [...r.sampledUserIds] })),
      edited: m.updatedAt > 0 && m.updatedAt > m.createdAt,
      seen: mine && this.isSeen(channel, m),
    };
  }

  private isSeen(channel: GroupChannel, m: BaseMessage): boolean {
    return channel.members.length > 1 && channel.getUnreadMembers(m).length === 0;
  }

  private seenIds(channel: GroupChannel): string[] {
    const myId = this.currentUserId;
    const cache = this.messages.get(channel.url);
    if (!cache) return [];
    return [...cache.values()]
      .filter((m) => senderOf(m)?.userId === myId && this.isSeen(channel, m))
      .map((m) => String(m.messageId));
  }

  private mapParent(parent: BaseMessage, myId: string | null): ReplyPreview {
    const senderId = senderOf(parent)?.userId ?? '';
    return {
      messageId: String(parent.messageId),
      senderName: senderId === myId ? 'You' : senderOf(parent)?.nickname || senderId,
      text: previewOf(parent),
    };
  }

  // ------------------------------------------------------------ channel events

  private buildHandler(): GroupChannelHandler {
    const emitChannel = (channel: GroupChannel) => {
      this.channels.set(channel.url, channel);
      this.emit({ type: 'channelChanged', channelUrl: channel.url, channel: this.mapChannel(channel) });
    };
    const emitReceipts = (channel: GroupChannel) =>
      this.emit({ type: 'readReceiptsChanged', channelUrl: channel.url, seenMessageIds: this.seenIds(channel) });

    return new GroupChannelHandler({
      onMessageReceived: (channel, message) => {
        if (!channel.isGroupChannel()) return;
        this.remember(channel.url, message);
        const mapped = this.mapMessage(message, channel);
        if (mapped) this.emit({ type: 'messageReceived', channelUrl: channel.url, message: mapped });
        emitChannel(channel);
      },
      onMessageUpdated: (channel, message) => {
        if (!channel.isGroupChannel()) return;
        this.remember(channel.url, message);
        const mapped = this.mapMessage(message, channel);
        if (mapped) this.emit({ type: 'messageUpdated', channelUrl: channel.url, message: mapped });
      },
      onMessageDeleted: (channel, messageId) => {
        this.messages.get(channel.url)?.delete(messageId);
        this.emit({ type: 'messageDeleted', channelUrl: channel.url, messageId: String(messageId) });
        if (channel.isGroupChannel()) emitChannel(channel);
      },
      onReactionUpdated: (channel, event) => {
        this.emit({
          type: 'reactionChanged',
          channelUrl: channel.url,
          messageId: String(event.messageId),
          key: event.key,
          userId: event.userId,
          added: event.operation === ReactionEventOperation.ADD,
        });
      },
      onTypingStatusUpdated: (channel) => {
        const myId = this.currentUserId;
        const names = channel
          .getTypingUsers()
          .filter((u) => u.userId !== myId)
          .map((u) => u.nickname || u.userId);
        this.emit({ type: 'typingChanged', channelUrl: channel.url, names });
      },
      onUnreadMemberStatusUpdated: emitReceipts,
      onUserMarkedRead: (channel) => emitReceipts(channel),
      onUndeliveredMemberStatusUpdated: emitReceipts,
      onChannelChanged: (channel) => {
        if (channel.isGroupChannel()) emitChannel(channel);
      },
      onChannelDeleted: (channelUrl) => {
        this.channels.delete(channelUrl);
        this.messages.delete(channelUrl);
        this.emit({ type: 'channelRemoved', channelUrl });
      },
      onUserReceivedInvitation: (channel) => emitChannel(channel),
      onUserJoined: (channel) => emitChannel(channel),
      onUserLeft: (channel) => emitChannel(channel),
      onChannelHidden: (channel) => this.emit({ type: 'channelRemoved', channelUrl: channel.url }),
    });
  }
}

/** Only user/file messages have a sender; admin messages do not. */
function senderOf(m: BaseMessage): UserMessage['sender'] | undefined {
  return (m as UserMessage).sender;
}

function previewOf(m: BaseMessage): string {
  if (m.isFileMessage()) {
    return (m.type ?? '').startsWith('image/') ? '\u{1F4F7} Photo' : `\u{1F4CE} ${m.name ?? 'File'}`;
  }
  return m.message ?? '';
}
