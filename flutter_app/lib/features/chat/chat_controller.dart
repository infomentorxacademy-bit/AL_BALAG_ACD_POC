import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import 'chat_models.dart';
import 'chat_service.dart';
import 'sendbird_chat_service.dart';

enum ChatPhase { idle, loading, ready, error }

class ChatState {
  const ChatState({
    this.phase = ChatPhase.idle,
    this.messages = const [],
    this.connection = ChatConnection.connecting,
    this.error,
  });

  final ChatPhase phase;

  /// Oldest first.
  final List<ChatMessage> messages;
  final ChatConnection connection;
  final String? error;

  ChatState copyWith({
    ChatPhase? phase,
    List<ChatMessage>? messages,
    ChatConnection? connection,
    String? error,
    bool clearError = false,
  }) =>
      ChatState(
        phase: phase ?? this.phase,
        messages: messages ?? this.messages,
        connection: connection ?? this.connection,
        error: clearError ? null : (error ?? this.error),
      );
}

final chatServiceProvider = Provider<ChatService>((ref) {
  final service = SendbirdChatService(appId: ref.watch(appConfigProvider).sendbirdAppId);
  return service;
});

class ChatController extends Notifier<ChatState> {
  StreamSubscription<ChatMessage>? _incomingSub;
  StreamSubscription<ChatConnection>? _connectionSub;
  int _localCounter = 0;

  @override
  ChatState build() {
    ref.onDispose(_cancelSubscriptions);
    return const ChatState();
  }

  ChatService get _service => ref.read(chatServiceProvider);

  Future<void> start({required String userId, required String nickname}) async {
    _cancelSubscriptions();
    state = const ChatState(phase: ChatPhase.loading);
    try {
      _connectionSub = _service.connectionChanges.listen(
        (c) => state = state.copyWith(connection: c),
      );
      await _service.connect(userId: userId, nickname: nickname);
      // Subscribe before loading history so nothing arrives unseen in between.
      _incomingSub = _service.incomingMessages.listen(_onIncoming);
      final history = await _service.joinRoomAndLoadHistory();
      state = state.copyWith(
        phase: ChatPhase.ready,
        messages: _merge(state.messages, history),
        connection: ChatConnection.online,
        clearError: true,
      );
    } catch (e) {
      state = state.copyWith(phase: ChatPhase.error, error: _describe(e));
    }
  }

  Future<void> stop() async {
    _cancelSubscriptions();
    state = const ChatState();
    try {
      await _service.disconnect();
    } catch (_) {
      // Disconnecting is best effort.
    }
  }

  /// Cancelling is not awaited: nothing depends on the cancel future completing.
  void _cancelSubscriptions() {
    unawaited(_incomingSub?.cancel());
    unawaited(_connectionSub?.cancel());
    _incomingSub = null;
    _connectionSub = null;
  }

  Future<void> send(String rawText) async {
    final text = rawText.trim();
    if (text.isEmpty || state.phase != ChatPhase.ready) return;
    final pending = ChatMessage(
      id: 'local-${_localCounter++}',
      text: text,
      senderId: 'me',
      senderName: 'Me',
      createdAt: DateTime.now(),
      isMine: true,
      status: DeliveryStatus.sending,
    );
    state = state.copyWith(messages: [...state.messages, pending]);
    await _deliver(pending);
  }

  Future<void> retry(ChatMessage failed) async {
    if (failed.status != DeliveryStatus.failed) return;
    _replace(failed.id, (m) => m.copyWith(status: DeliveryStatus.sending));
    await _deliver(failed.copyWith(status: DeliveryStatus.sending));
  }

  Future<void> _deliver(ChatMessage pending) async {
    try {
      final sent = await _service.send(pending.text);
      _replace(pending.id, (_) => sent);
    } catch (_) {
      _replace(pending.id, (m) => m.copyWith(status: DeliveryStatus.failed));
    }
  }

  void _replace(String id, ChatMessage Function(ChatMessage) update) {
    state = state.copyWith(
      messages: [for (final m in state.messages) m.id == id ? update(m) : m],
    );
  }

  void _onIncoming(ChatMessage message) {
    state = state.copyWith(messages: _merge(state.messages, [message]));
  }

  /// Adds [incoming] to [existing] without duplicates, keeping time order.
  static List<ChatMessage> _merge(List<ChatMessage> existing, List<ChatMessage> incoming) {
    final seen = existing.map((m) => m.id).toSet();
    final merged = [...existing, ...incoming.where((m) => seen.add(m.id))];
    merged.sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return merged;
  }

  static String _describe(Object e) {
    final text = e.toString();
    if (text.contains('SendbirdException')) {
      return 'Could not reach Sendbird. Check your connection and the App ID.\n$text';
    }
    return text;
  }
}

final chatControllerProvider =
    NotifierProvider<ChatController, ChatState>(ChatController.new);
