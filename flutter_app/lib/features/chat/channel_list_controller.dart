import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'chat_models.dart';
import 'chat_providers.dart';
import 'chat_service.dart';

enum ChatPhase { idle, loading, ready, error }

class ChannelListState {
  const ChannelListState({
    this.phase = ChatPhase.idle,
    this.channels = const [],
    this.connection = ChatConnection.connecting,
    this.error,
  });

  final ChatPhase phase;

  /// Newest activity first.
  final List<ChatChannel> channels;
  final ChatConnection connection;
  final String? error;

  int get totalUnread => channels.fold(0, (sum, c) => sum + c.unreadCount);

  ChannelListState copyWith({
    ChatPhase? phase,
    List<ChatChannel>? channels,
    ChatConnection? connection,
    String? error,
    bool clearError = false,
  }) =>
      ChannelListState(
        phase: phase ?? this.phase,
        channels: channels ?? this.channels,
        connection: connection ?? this.connection,
        error: clearError ? null : (error ?? this.error),
      );
}

/// Owns the chat connection and the list of conversations.
class ChannelListController extends Notifier<ChannelListState> {
  StreamSubscription<ChatEvent>? _eventsSub;
  StreamSubscription<ChatConnection>? _connectionSub;

  @override
  ChannelListState build() {
    ref.onDispose(_cancelSubscriptions);
    return const ChannelListState();
  }

  ChatService get _service => ref.read(chatServiceProvider);

  Future<void> start({required String userId, required String nickname}) async {
    _cancelSubscriptions();
    state = const ChannelListState(phase: ChatPhase.loading);
    try {
      _connectionSub = _service.connectionChanges.listen(
        (c) => state = state.copyWith(connection: c),
      );
      await _service.connect(userId: userId, nickname: nickname);
      // Subscribe before loading so nothing that arrives in between is missed.
      _eventsSub = _service.events.listen(_onEvent);
      await _service.joinDemoRoom();
      final loaded = await _service.loadChannels();
      state = state.copyWith(
        phase: ChatPhase.ready,
        channels: _sorted(_mergeById(state.channels, loaded)),
        connection: ChatConnection.online,
        clearError: true,
      );
    } catch (e) {
      state = state.copyWith(phase: ChatPhase.error, error: describeChatError(e));
    }
  }

  Future<void> stop() async {
    _cancelSubscriptions();
    state = const ChannelListState();
    try {
      await _service.disconnect();
    } catch (_) {
      // Disconnecting is best effort.
    }
  }

  /// Pull-to-refresh. Keeps the current list on screen if it fails.
  Future<void> refresh() async {
    try {
      final loaded = await _service.loadChannels();
      state = state.copyWith(channels: _sorted(loaded), clearError: true);
    } catch (e) {
      state = state.copyWith(error: describeChatError(e));
    }
  }

  /// Starts a direct chat (one id) or a group (several ids). Throws on failure so the form can
  /// show the reason.
  Future<ChatChannel> createChannel({required List<String> userIds, String? name}) async {
    final channel = await _service.createChannel(userIds: userIds, name: name);
    _upsert(channel);
    return channel;
  }

  Future<void> leave(String channelUrl) async {
    await _service.leaveChannel(channelUrl);
    state = state.copyWith(channels: [for (final c in state.channels) if (c.url != channelUrl) c]);
  }

  /// Called when a conversation is opened: its unread badge goes away.
  void clearUnread(String channelUrl) {
    state = state.copyWith(
      channels: [for (final c in state.channels) c.url == channelUrl ? c.copyWith(unreadCount: 0) : c],
    );
  }

  void _onEvent(ChatEvent event) {
    switch (event) {
      case ChannelChanged(:final channel):
        _upsert(channel);
      case ChannelRemoved(:final channelUrl):
        state = state.copyWith(channels: [for (final c in state.channels) if (c.url != channelUrl) c]);
      default:
        break;
    }
  }

  void _upsert(ChatChannel channel) {
    state = state.copyWith(channels: _sorted(_mergeById(state.channels, [channel])));
  }

  /// Adds [incoming] to [existing]; a channel that is in both takes the incoming (newer) version.
  static List<ChatChannel> _mergeById(List<ChatChannel> existing, List<ChatChannel> incoming) {
    final byUrl = {for (final c in existing) c.url: c};
    for (final c in incoming) {
      byUrl[c.url] = c;
    }
    return byUrl.values.toList();
  }

  static List<ChatChannel> _sorted(List<ChatChannel> list) {
    final copy = [...list];
    copy.sort((a, b) {
      final at = a.lastMessageAt;
      final bt = b.lastMessageAt;
      if (at == null && bt == null) return 0;
      if (at == null) return 1;
      if (bt == null) return -1;
      return bt.compareTo(at);
    });
    return copy;
  }

  /// Cancelling is not awaited: nothing depends on the cancel future completing.
  void _cancelSubscriptions() {
    unawaited(_eventsSub?.cancel());
    unawaited(_connectionSub?.cancel());
    _eventsSub = null;
    _connectionSub = null;
  }
}

final channelListControllerProvider =
    NotifierProvider<ChannelListController, ChannelListState>(ChannelListController.new);

/// A short, user-facing explanation of a chat failure.
String describeChatError(Object e) {
  final text = e.toString();
  if (text.contains('SendbirdException')) {
    return 'Could not reach Sendbird. Check your connection and the App ID.\n$text';
  }
  return text;
}
