import { describeChatError } from './channelListController';
import type { ChannelListController, ChatPhase } from './channelListController';
import type { ChatEvent, ChatService, Unsubscribe } from './chatService';
import { Store } from './store';
import {
  canDelete,
  canEdit,
  canReplyTo,
  isDelivered,
  newMessage,
  reactedBy,
  toReplyPreview,
} from './types';
import type { ChatChannel, ChatMessage } from './types';

export interface PickedImage {
  uri: string;
  name: string;
  type: string;
  size: number;
}

export interface ConversationState {
  channel?: ChatChannel;
  phase: ChatPhase;
  /** Oldest first. */
  messages: ChatMessage[];
  error?: string;
  /** The message the user is composing a reply to. */
  replyingTo?: ChatMessage;
  /** The own message being edited (the composer holds its text). */
  editing?: ChatMessage;
  /** Other people typing right now. */
  typingNames: string[];
  hasMore: boolean;
  loadingMore: boolean;
  /** A one-off problem to show as a toast (e.g. "Could not delete"). */
  notice?: string;
}

const initial: ConversationState = {
  phase: 'idle',
  messages: [],
  typingNames: [],
  hasMore: false,
  loadingMore: false,
};

export const PAGE_SIZE = 30;

/** The conversation that is currently open. */
export class ConversationController extends Store<ConversationState> {
  private unsubscribe?: Unsubscribe;
  private typingTimer?: ReturnType<typeof setTimeout>;
  private typing = false;
  private openUrl?: string;
  private localCounter = 0;

  constructor(
    private readonly service: ChatService,
    private readonly channelList: ChannelListController,
    private readonly pickImage: () => Promise<PickedImage | null>,
    private readonly typingTimeoutMs = 3000,
  ) {
    super(initial);
  }

  private get myId(): string | null {
    return this.service.currentUserId;
  }

  async open(channel: ChatChannel): Promise<void> {
    this.cancel();
    this.openUrl = channel.url;
    this.set({ ...initial, channel, phase: 'loading' });
    try {
      // Subscribe before loading history so nothing arrives unseen in between.
      this.unsubscribe = this.service.onEvent((e) => this.onEvent(e));
      const history = await this.service.loadMessages(channel.url, { limit: PAGE_SIZE });
      this.set({
        ...this.state,
        phase: 'ready',
        messages: merge(this.state.messages, history),
        hasMore: history.length >= PAGE_SIZE,
        error: undefined,
      });
      this.markRead();
    } catch (e) {
      this.set({ ...this.state, phase: 'error', error: describeChatError(e) });
    }
  }

  close(): void {
    this.cancel();
    this.openUrl = undefined;
    this.set(initial);
  }

  private cancel(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.typingTimer = undefined;
    if (this.typing && this.openUrl) {
      this.typing = false;
      try {
        this.service.setTyping(this.openUrl, false);
      } catch {
        // Best effort.
      }
    }
  }

  /** Loads the page of messages before the oldest one we have. */
  async loadOlder(): Promise<void> {
    const { channel, phase, hasMore, loadingMore } = this.state;
    if (!channel || phase !== 'ready' || !hasMore || loadingMore) return;
    const delivered = this.state.messages.filter(isDelivered);
    if (delivered.length === 0) return;
    this.patch({ loadingMore: true });
    try {
      const older = await this.service.loadMessages(channel.url, {
        before: delivered[0].createdAt,
        limit: PAGE_SIZE,
      });
      const known = new Set(this.state.messages.map((m) => m.id));
      const fresh = older.filter((m) => !known.has(m.id));
      this.patch({
        messages: merge(this.state.messages, fresh),
        hasMore: fresh.length > 0 && older.length >= PAGE_SIZE,
        loadingMore: false,
      });
    } catch {
      this.patch({ loadingMore: false, notice: 'Could not load earlier messages.' });
    }
  }

  // ------------------------------------------------------------- reply / edit

  startReply(message: ChatMessage): void {
    if (canReplyTo(message)) this.patch({ replyingTo: message, editing: undefined });
  }
  cancelReply(): void {
    this.patch({ replyingTo: undefined });
  }
  startEdit(message: ChatMessage): void {
    if (canEdit(message)) this.patch({ editing: message, replyingTo: undefined });
  }
  cancelEdit(): void {
    this.patch({ editing: undefined });
  }
  clearNotice(): void {
    this.patch({ notice: undefined });
  }

  // ---------------------------------------------------------------- sending

  /** Sends [rawText], or saves it as the new text if a message is being edited. */
  async send(rawText: string): Promise<void> {
    const text = rawText.trim();
    if (!text || this.state.phase !== 'ready') return;
    this.stopTyping();
    const editing = this.state.editing;
    if (editing) return this.commitEdit(editing, text);
    const pending = newMessage({
      id: this.localId(),
      text,
      senderId: this.myId ?? 'me',
      isMine: true,
      status: 'sending',
      replyTo: this.state.replyingTo ? toReplyPreview(this.state.replyingTo) : undefined,
    });
    this.patch({ messages: [...this.state.messages, pending], replyingTo: undefined });
    await this.deliver(pending);
  }

  /** Lets the user pick a photo and sends it. */
  async sendImage(): Promise<void> {
    if (this.state.phase !== 'ready') return;
    let picked: PickedImage | null;
    try {
      picked = await this.pickImage();
    } catch {
      this.patch({ notice: 'Could not open the photo gallery.' });
      return;
    }
    if (!picked || this.state.phase !== 'ready') return;
    const pending = newMessage({
      id: this.localId(),
      text: '',
      senderId: this.myId ?? 'me',
      isMine: true,
      status: 'sending',
      kind: 'image',
      localPath: picked.uri,
      attachmentName: picked.name,
      replyTo: this.state.replyingTo ? toReplyPreview(this.state.replyingTo) : undefined,
    });
    this.imageFiles.set(pending.id, picked);
    this.patch({ messages: [...this.state.messages, pending], replyingTo: undefined });
    await this.deliver(pending);
  }

  private imageFiles = new Map<string, PickedImage>();

  async retry(failed: ChatMessage): Promise<void> {
    if (failed.status !== 'failed') return;
    const again: ChatMessage = { ...failed, status: 'sending' };
    this.replace(failed.id, () => again);
    await this.deliver(again);
  }

  private async deliver(pending: ChatMessage): Promise<void> {
    const channel = this.state.channel;
    if (!channel) return;
    try {
      let sent: ChatMessage;
      if (pending.kind === 'image') {
        const file = this.imageFiles.get(pending.id);
        if (!file) throw new Error('Photo no longer available');
        sent = await this.service.sendImage(channel.url, file, pending.replyTo);
      } else {
        sent = await this.service.sendText(channel.url, pending.text, pending.replyTo);
      }
      // Keep the quote even if the server echo does not include the parent message.
      const merged = sent.replyTo ? sent : { ...sent, replyTo: pending.replyTo };
      this.imageFiles.delete(pending.id);
      this.replace(pending.id, () => merged);
      this.dedupe(merged.id);
    } catch {
      this.replace(pending.id, (m) => ({ ...m, status: 'failed' }));
    }
  }

  private async commitEdit(original: ChatMessage, text: string): Promise<void> {
    const channel = this.state.channel;
    if (!channel) return;
    this.patch({ editing: undefined });
    if (text === original.text) return;
    try {
      const updated = await this.service.editMessage(channel.url, original.id, text);
      this.replace(original.id, (m) => ({ ...m, text: updated.text, edited: true }));
    } catch {
      this.patch({ notice: 'Could not edit the message.' });
    }
  }

  async delete(message: ChatMessage): Promise<void> {
    const channel = this.state.channel;
    if (!channel) return;
    if (!isDelivered(message)) {
      // Never reached the server: just drop it.
      this.remove(message.id);
      return;
    }
    if (!canDelete(message)) return;
    try {
      await this.service.deleteMessage(channel.url, message.id);
      this.remove(message.id);
    } catch {
      this.patch({ notice: 'Could not delete the message.' });
    }
  }

  // --------------------------------------------------------------- reactions

  async toggleReaction(message: ChatMessage, key: string): Promise<void> {
    const channel = this.state.channel;
    const me = this.myId;
    if (!channel || !me || !isDelivered(message)) return;
    const already = message.reactions.some((r) => r.key === key && reactedBy(r, me));
    this.applyReaction(message.id, key, me, !already);
    try {
      await this.service.setReaction(channel.url, message.id, key, !already);
    } catch {
      this.applyReaction(message.id, key, me, already);
      this.patch({ notice: 'Could not update the reaction.' });
    }
  }

  private applyReaction(messageId: string, key: string, userId: string, added: boolean): void {
    this.replace(messageId, (m) => {
      const reactions = [];
      let found = false;
      for (const r of m.reactions) {
        if (r.key !== key) {
          reactions.push(r);
          continue;
        }
        found = true;
        const users = r.userIds.filter((u) => u !== userId);
        if (added) users.push(userId);
        if (users.length > 0) reactions.push({ key, userIds: users });
      }
      if (!found && added) reactions.push({ key, userIds: [userId] });
      return { ...m, reactions };
    });
  }

  // ------------------------------------------------------------------ typing

  /** Call on every keystroke: tells the others we are typing, and stops after a pause. */
  onTextChanged(text: string): void {
    const url = this.state.channel?.url;
    if (!url || this.state.phase !== 'ready') return;
    if (!text.trim()) {
      this.stopTyping();
      return;
    }
    if (!this.typing) {
      this.typing = true;
      this.service.setTyping(url, true);
    }
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => this.stopTyping(), this.typingTimeoutMs);
  }

  private stopTyping(): void {
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.typingTimer = undefined;
    const url = this.state.channel?.url;
    if (this.typing && url) {
      this.typing = false;
      this.service.setTyping(url, false);
    }
  }

  // ------------------------------------------------------------------ events

  private onEvent(event: ChatEvent): void {
    if (event.channelUrl !== this.state.channel?.url) return;
    switch (event.type) {
      case 'messageReceived':
        this.patch({ messages: merge(this.state.messages, [event.message]) });
        if (!event.message.isMine) this.markRead();
        break;
      case 'messageUpdated':
        this.replace(event.message.id, (old) => ({ ...event.message, seen: old.seen || event.message.seen }));
        break;
      case 'messageDeleted':
        this.remove(event.messageId);
        break;
      case 'reactionChanged':
        this.applyReaction(event.messageId, event.key, event.userId, event.added);
        break;
      case 'typingChanged':
        this.patch({ typingNames: event.names });
        break;
      case 'readReceiptsChanged': {
        const seen = new Set(event.seenMessageIds);
        this.patch({ messages: this.state.messages.map((m) => (seen.has(m.id) ? { ...m, seen: true } : m)) });
        break;
      }
      case 'channelChanged':
        this.patch({ channel: { ...event.channel, unreadCount: 0 } });
        break;
      case 'channelRemoved':
        break;
    }
  }

  private markRead(): void {
    const url = this.state.channel?.url;
    if (!url) return;
    this.channelList.clearUnread(url);
    this.service.markRead(url).catch(() => {
      // Read receipts are best effort.
    });
  }

  // ----------------------------------------------------------------- helpers

  private localId(): string {
    return `local-${this.localCounter++}`;
  }

  private replace(id: string, update: (m: ChatMessage) => ChatMessage): void {
    this.patch({ messages: this.state.messages.map((m) => (m.id === id ? update(m) : m)) });
  }

  private remove(id: string): void {
    this.patch({
      messages: this.state.messages.filter((m) => m.id !== id),
      replyingTo: this.state.replyingTo?.id === id ? undefined : this.state.replyingTo,
      editing: this.state.editing?.id === id ? undefined : this.state.editing,
    });
  }

  /** If the server echo of a sent message also arrived as an incoming event, keep only one. */
  private dedupe(id: string): void {
    let seen = false;
    this.patch({
      messages: this.state.messages.filter((m) => {
        if (m.id !== id) return true;
        if (seen) return false;
        seen = true;
        return true;
      }),
    });
  }
}

/** Adds [incoming] to [existing] without duplicates, keeping time order. */
function merge(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const seen = new Set(existing.map((m) => m.id));
  const merged = [...existing, ...incoming.filter((m) => !seen.has(m.id) && seen.add(m.id))];
  return merged.sort((a, b) => a.createdAt - b.createdAt);
}
