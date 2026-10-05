import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'channel_list_controller.dart';
import 'chat_models.dart';
import 'chat_providers.dart';
import 'chat_service.dart';

class ConversationState {
  const ConversationState({
    this.channel,
    this.phase = ChatPhase.idle,
    this.messages = const [],
    this.error,
    this.replyingTo,
    this.editing,
    this.typingNames = const [],
    this.hasMore = false,
    this.loadingMore = false,
    this.notice,
  });

  final ChatChannel? channel;
  final ChatPhase phase;

  /// Oldest first.
  final List<ChatMessage> messages;
  final String? error;

  /// The message the user is currently composing a reply to.
  final ChatMessage? replyingTo;

  /// The own message currently being edited (the composer holds its text).
  final ChatMessage? editing;

  /// Other people typing right now.
  final List<String> typingNames;
  final bool hasMore;
  final bool loadingMore;

  /// A one-off problem to show in a snackbar (e.g. "Could not delete").
  final String? notice;

  ConversationState copyWith({
    ChatChannel? channel,
    ChatPhase? phase,
    List<ChatMessage>? messages,
    String? error,
    bool clearError = false,
    ChatMessage? replyingTo,
    bool clearReply = false,
    ChatMessage? editing,
    bool clearEditing = false,
    List<String>? typingNames,
    bool? hasMore,
    bool? loadingMore,
    String? notice,
    bool clearNotice = false,
  }) =>
      ConversationState(
        channel: channel ?? this.channel,
        phase: phase ?? this.phase,
        messages: messages ?? this.messages,
        error: clearError ? null : (error ?? this.error),
        replyingTo: clearReply ? null : (replyingTo ?? this.replyingTo),
        editing: clearEditing ? null : (editing ?? this.editing),
        typingNames: typingNames ?? this.typingNames,
        hasMore: hasMore ?? this.hasMore,
        loadingMore: loadingMore ?? this.loadingMore,
        notice: clearNotice ? null : (notice ?? this.notice),
      );
}

/// The conversation that is currently open.
class ConversationController extends Notifier<ConversationState> {
  static const pageSize = 30;
  static const typingTimeout = Duration(seconds: 3);

  StreamSubscription<ChatEvent>? _eventsSub;
  Timer? _typingTimer;
  bool _typing = false;
  int _localCounter = 0;

  /// The open channel's url, kept outside `state` because dispose callbacks may not read state.
  String? _openUrl;

  @override
  ConversationState build() {
    ref.onDispose(_cancel);
    return const ConversationState();
  }

  ChatService get _service => ref.read(chatServiceProvider);
  String? get _myId => _service.currentUserId;

  Future<void> open(ChatChannel channel) async {
    _cancel();
    _openUrl = channel.url;
    state = ConversationState(channel: channel, phase: ChatPhase.loading);
    try {
      // Subscribe before loading history so nothing arrives unseen in between.
      _eventsSub = _service.events.listen(_onEvent);
      final history = await _service.loadMessages(channel.url, limit: pageSize);
      state = state.copyWith(
        phase: ChatPhase.ready,
        messages: _merge(state.messages, history),
        hasMore: history.length >= pageSize,
        clearError: true,
      );
      _markRead();
    } catch (e) {
      state = state.copyWith(phase: ChatPhase.error, error: describeChatError(e));
    }
  }

  void close() {
    // The screen schedules this after it is disposed; the provider may be gone by then.
    if (!ref.mounted) return;
    _cancel();
    _openUrl = null;
    state = const ConversationState();
  }

  void _cancel() {
    unawaited(_eventsSub?.cancel());
    _eventsSub = null;
    _typingTimer?.cancel();
    _typingTimer = null;
    final url = _openUrl;
    if (_typing && url != null) {
      _typing = false;
      try {
        ref.read(chatServiceProvider).setTyping(url, typing: false);
      } catch (_) {
        // Best effort (the container may already be shutting down).
      }
    }
  }

  /// Loads the page of messages before the oldest one we have.
  Future<void> loadOlder() async {
    final channel = state.channel;
    if (channel == null || state.phase != ChatPhase.ready || !state.hasMore || state.loadingMore) return;
    final delivered = state.messages.where((m) => m.isDelivered).toList();
    if (delivered.isEmpty) return;
    state = state.copyWith(loadingMore: true);
    try {
      final older = await _service.loadMessages(
        channel.url,
        before: delivered.first.createdAt,
        limit: pageSize,
      );
      final known = state.messages.map((m) => m.id).toSet();
      final fresh = older.where((m) => !known.contains(m.id)).toList();
      state = state.copyWith(
        messages: _merge(state.messages, fresh),
        hasMore: fresh.isNotEmpty && older.length >= pageSize,
        loadingMore: false,
      );
    } catch (e) {
      state = state.copyWith(loadingMore: false, notice: 'Could not load earlier messages.');
    }
  }

  // ------------------------------------------------------------- reply / edit

  void startReply(ChatMessage message) {
    if (message.canReplyTo) state = state.copyWith(replyingTo: message, clearEditing: true);
  }

  void cancelReply() => state = state.copyWith(clearReply: true);

  void startEdit(ChatMessage message) {
    if (message.canEdit) state = state.copyWith(editing: message, clearReply: true);
  }

  void cancelEdit() => state = state.copyWith(clearEditing: true);

  void clearNotice() => state = state.copyWith(clearNotice: true);

  // ---------------------------------------------------------------- sending

  /// Sends [rawText], or saves it as the new text if a message is being edited.
  Future<void> send(String rawText) async {
    final text = rawText.trim();
    if (text.isEmpty || state.phase != ChatPhase.ready) return;
    _stopTyping();
    final editing = state.editing;
    if (editing != null) {
      await _commitEdit(editing, text);
      return;
    }
    final pending = ChatMessage(
      id: _localId(),
      text: text,
      senderId: _myId ?? 'me',
      senderName: 'Me',
      createdAt: DateTime.now(),
      isMine: true,
      status: DeliveryStatus.sending,
      replyTo: state.replyingTo?.toReplyPreview(),
    );
    state = state.copyWith(messages: [...state.messages, pending], clearReply: true);
    await _deliver(pending);
  }

  /// Lets the user pick a photo and sends it.
  Future<void> sendImage() async {
    if (state.phase != ChatPhase.ready) return;
    final String? path;
    try {
      path = await ref.read(imagePickerProvider)();
    } catch (_) {
      state = state.copyWith(notice: 'Could not open the photo gallery.');
      return;
    }
    if (path == null || state.phase != ChatPhase.ready) return;
    final pending = ChatMessage(
      id: _localId(),
      text: '',
      senderId: _myId ?? 'me',
      senderName: 'Me',
      createdAt: DateTime.now(),
      isMine: true,
      status: DeliveryStatus.sending,
      replyTo: state.replyingTo?.toReplyPreview(),
      kind: MessageKind.image,
      localPath: path,
    );
    state = state.copyWith(messages: [...state.messages, pending], clearReply: true);
    await _deliver(pending);
  }

  Future<void> retry(ChatMessage failed) async {
    if (failed.status != DeliveryStatus.failed) return;
    final again = failed.copyWith(status: DeliveryStatus.sending);
    _replace(failed.id, (_) => again);
    await _deliver(again);
  }

  Future<void> _deliver(ChatMessage pending) async {
    final channel = state.channel;
    if (channel == null) return;
    try {
      final sent = pending.kind == MessageKind.image
          ? await _service.sendImage(channel.url, pending.localPath!, replyTo: pending.replyTo)
          : await _service.sendText(channel.url, pending.text, replyTo: pending.replyTo);
      // Keep the quote even if the server echo does not include the parent message.
      final merged = sent.replyTo == null ? sent.copyWith(replyTo: pending.replyTo) : sent;
      _replace(pending.id, (_) => merged);
      _dedupe(merged.id);
    } catch (_) {
      _replace(pending.id, (m) => m.copyWith(status: DeliveryStatus.failed));
    }
  }

  Future<void> _commitEdit(ChatMessage original, String text) async {
    final channel = state.channel;
    if (channel == null) return;
    state = state.copyWith(clearEditing: true);
    if (text == original.text) return;
    try {
      final updated = await _service.editMessage(channel.url, original.id, text);
      _replace(original.id, (m) => m.copyWith(text: updated.text, edited: true));
    } catch (_) {
      state = state.copyWith(notice: 'Could not edit the message.');
    }
  }

  Future<void> delete(ChatMessage message) async {
    final channel = state.channel;
    if (channel == null) return;
    if (!message.isDelivered) {
      // Never reached the server: just drop it.
      _remove(message.id);
      return;
    }
    if (!message.canDelete) return;
    try {
      await _service.deleteMessage(channel.url, message.id);
      _remove(message.id);
    } catch (_) {
      state = state.copyWith(notice: 'Could not delete the message.');
    }
  }

  // --------------------------------------------------------------- reactions

  Future<void> toggleReaction(ChatMessage message, String key) async {
    final channel = state.channel;
    final me = _myId;
    if (channel == null || me == null || !message.isDelivered) return;
    final already = message.reactions.any((r) => r.key == key && r.reactedBy(me));
    _applyReaction(message.id, key, me, added: !already);
    try {
      await _service.setReaction(channel.url, message.id, key, on: !already);
    } catch (_) {
      _applyReaction(message.id, key, me, added: already);
      state = state.copyWith(notice: 'Could not update the reaction.');
    }
  }

  void _applyReaction(String messageId, String key, String userId, {required bool added}) {
    _replace(messageId, (m) {
      final reactions = <ChatReaction>[];
      var found = false;
      for (final r in m.reactions) {
        if (r.key != key) {
          reactions.add(r);
          continue;
        }
        found = true;
        final users = [...r.userIds]..remove(userId);
        if (added) users.add(userId);
        if (users.isNotEmpty) reactions.add(ChatReaction(key: key, userIds: users));
      }
      if (!found && added) reactions.add(ChatReaction(key: key, userIds: [userId]));
      return m.copyWith(reactions: reactions);
    });
  }

  // ------------------------------------------------------------------ typing

  /// Call on every keystroke: tells the others we are typing, and stops after a pause.
  void onTextChanged(String text) {
    final url = state.channel?.url;
    if (url == null || state.phase != ChatPhase.ready) return;
    if (text.trim().isEmpty) {
      _stopTyping();
      return;
    }
    if (!_typing) {
      _typing = true;
      _service.setTyping(url, typing: true);
    }
    _typingTimer?.cancel();
    _typingTimer = Timer(typingTimeout, _stopTyping);
  }

  void _stopTyping() {
    _typingTimer?.cancel();
    _typingTimer = null;
    final url = state.channel?.url;
    if (_typing && url != null) {
      _typing = false;
      _service.setTyping(url, typing: false);
    }
  }

  // ------------------------------------------------------------------ events

  void _onEvent(ChatEvent event) {
    if (event.channelUrl != state.channel?.url) return;
    switch (event) {
      case MessageReceived(:final message):
        state = state.copyWith(messages: _merge(state.messages, [message]));
        if (!message.isMine) _markRead();
      case MessageUpdated(:final message):
        _replace(message.id, (old) => message.copyWith(seen: old.seen || message.seen));
      case MessageDeleted(:final messageId):
        _remove(messageId);
      case ReactionChanged(:final messageId, :final key, :final userId, :final added):
        _applyReaction(messageId, key, userId, added: added);
      case TypingChanged(:final names):
        state = state.copyWith(typingNames: names);
      case ReadReceiptsChanged(:final seenMessageIds):
        state = state.copyWith(
          messages: [
            for (final m in state.messages) seenMessageIds.contains(m.id) ? m.copyWith(seen: true) : m,
          ],
        );
      case ChannelChanged(:final channel):
        state = state.copyWith(channel: channel.copyWith(unreadCount: 0));
      case ChannelRemoved():
        break;
    }
  }

  void _markRead() {
    final url = state.channel?.url;
    if (url == null) return;
    ref.read(channelListControllerProvider.notifier).clearUnread(url);
    unawaited(_service.markRead(url).catchError((_) {
      // Read receipts are best effort.
    }));
  }

  // ----------------------------------------------------------------- helpers

  String _localId() => 'local-${_localCounter++}';

  void _replace(String id, ChatMessage Function(ChatMessage) update) {
    state = state.copyWith(
      messages: [for (final m in state.messages) m.id == id ? update(m) : m],
    );
  }

  void _remove(String id) {
    state = state.copyWith(
      messages: [for (final m in state.messages) if (m.id != id) m],
      clearReply: state.replyingTo?.id == id,
      clearEditing: state.editing?.id == id,
    );
  }

  /// If the server echo of a sent message also arrived as an incoming event, keep only one.
  void _dedupe(String id) {
    final seen = <String>{};
    state = state.copyWith(
      messages: [for (final m in state.messages) if (m.id != id || seen.add(id)) m],
    );
  }

  /// Adds [incoming] to [existing] without duplicates, keeping time order.
  static List<ChatMessage> _merge(List<ChatMessage> existing, List<ChatMessage> incoming) {
    final seen = existing.map((m) => m.id).toSet();
    final merged = [...existing, ...incoming.where((m) => seen.add(m.id))];
    merged.sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return merged;
  }
}

final conversationControllerProvider =
    NotifierProvider<ConversationController, ConversationState>(ConversationController.new);
