import 'dart:async';
import 'dart:io';

import 'package:sendbird_chat_sdk/sendbird_chat_sdk.dart';

import '../../core/config.dart';
import 'chat_models.dart';
import 'chat_service.dart';

/// Sendbird implementation of [ChatService]. All Sendbird types stay inside this file.
class SendbirdChatService implements ChatService {
  SendbirdChatService({required this.appId});

  final String appId;

  static const _handlerKey = 'poc-chat-handler';

  final _events = StreamController<ChatEvent>.broadcast();
  final _connection = StreamController<ChatConnection>.broadcast();

  bool _initialized = false;

  /// Channels and messages we have seen, so later calls (react, mark read, ...) can reuse them.
  final _channels = <String, GroupChannel>{};
  final _messages = <String, Map<int, BaseMessage>>{};

  @override
  Stream<ChatEvent> get events => _events.stream;

  @override
  Stream<ChatConnection> get connectionChanges => _connection.stream;

  @override
  String? get currentUserId => SendbirdChat.currentUser?.userId;

  // ---------------------------------------------------------------- connection

  @override
  Future<void> connect({required String userId, String? nickname}) async {
    if (!_initialized) {
      await SendbirdChat.init(appId: appId);
      SendbirdChat.addConnectionHandler(_handlerKey, _ConnectionBridge(_connection));
      _initialized = true;
    }
    SendbirdChat.addChannelHandler(_handlerKey, _ChannelBridge(this));
    _connection.add(ChatConnection.connecting);
    await SendbirdChat.connect(userId, nickname: nickname);
    _connection.add(ChatConnection.online);
  }

  @override
  Future<void> disconnect() async {
    SendbirdChat.removeChannelHandler(_handlerKey);
    _channels.clear();
    _messages.clear();
    if (_initialized) await SendbirdChat.disconnect();
  }

  // ------------------------------------------------------------------ channels

  @override
  Future<void> joinDemoRoom() async {
    GroupChannel channel;
    try {
      channel = await GroupChannel.getChannel(AppConfig.demoChannelUrl);
    } on SendbirdException {
      // Not found: the first user to arrive creates the shared room.
      final params = GroupChannelCreateParams()
        ..channelUrl = AppConfig.demoChannelUrl
        ..name = AppConfig.demoChannelName
        ..isPublic = true
        ..isDistinct = false;
      channel = await GroupChannel.createChannel(params);
    }
    if (channel.myMemberState != MemberState.joined) {
      await channel.join();
    }
    _channels[channel.channelUrl] = channel;
  }

  @override
  Future<List<ChatChannel>> loadChannels() async {
    final query = GroupChannelListQuery()
      ..limit = 20
      ..order = GroupChannelListQueryOrder.latestLastMessage
      ..myMemberStateFilter = MyMemberStateFilter.joined
      ..includeEmpty = true;
    final result = <GroupChannel>[];
    // A few pages are plenty for a demo.
    for (var page = 0; page < 5 && query.hasNext; page++) {
      result.addAll(await query.next());
    }
    for (final c in result) {
      _channels[c.channelUrl] = c;
    }
    return result.map(_mapChannel).toList();
  }

  @override
  Future<ChatChannel> createChannel({required List<String> userIds, String? name}) async {
    final params = GroupChannelCreateParams()
      ..userIds = userIds
      // One other person = a direct chat; Sendbird returns the existing one if there is one.
      ..isDistinct = userIds.length == 1;
    if (userIds.length > 1 && name != null && name.trim().isNotEmpty) {
      params.name = name.trim();
    }
    final channel = await GroupChannel.createChannel(params);
    _channels[channel.channelUrl] = channel;
    return _mapChannel(channel);
  }

  @override
  Future<void> leaveChannel(String channelUrl) async {
    final channel = await _channel(channelUrl);
    await channel.leave();
    _channels.remove(channelUrl);
    _messages.remove(channelUrl);
    _events.add(ChannelRemoved(channelUrl));
  }

  Future<GroupChannel> _channel(String url) async {
    final cached = _channels[url];
    if (cached != null) return cached;
    final fetched = await GroupChannel.getChannel(url);
    _channels[url] = fetched;
    return fetched;
  }

  // ------------------------------------------------------------------ messages

  @override
  Future<List<ChatMessage>> loadMessages(String channelUrl, {DateTime? before, int limit = 30}) async {
    final channel = await _channel(channelUrl);
    final params = MessageListParams()
      ..previousResultSize = limit
      ..nextResultSize = 0
      ..reverse = false
      // Include the quoted parent of replies so they render with their context.
      ..includeParentMessageInfo = true
      ..replyType = ReplyType.all;
    final raw = await channel.getMessagesByTimestamp(
      (before ?? DateTime.now()).millisecondsSinceEpoch,
      params,
    );
    final mapped = <ChatMessage>[];
    for (final m in raw.whereType<BaseMessage>()) {
      _remember(channelUrl, m);
      final message = _mapMessage(m, channel);
      if (message != null) mapped.add(message);
    }
    mapped.sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return mapped;
  }

  @override
  Future<ChatMessage> sendText(String channelUrl, String text, {ReplyPreview? replyTo}) async {
    final channel = await _channel(channelUrl);
    final params = UserMessageCreateParams(message: text);
    _applyReply(params, replyTo);
    final completer = Completer<ChatMessage>();
    channel.sendUserMessage(
      params,
      handler: (message, error) => _finishSend(completer, channel, message, error),
    );
    channel.endTyping();
    return completer.future;
  }

  @override
  Future<ChatMessage> sendImage(String channelUrl, String filePath, {ReplyPreview? replyTo}) async {
    final channel = await _channel(channelUrl);
    final params = FileMessageCreateParams.withFile(File(filePath));
    _applyReply(params, replyTo);
    final completer = Completer<ChatMessage>();
    channel.sendFileMessage(
      params,
      handler: (message, error) => _finishSend(completer, channel, message, error),
    );
    return completer.future;
  }

  void _applyReply(BaseMessageCreateParams params, ReplyPreview? replyTo) {
    final parentId = replyTo == null ? null : int.tryParse(replyTo.messageId);
    if (parentId != null) {
      params
        ..parentMessageId = parentId
        // Show the reply in the main conversation, not only inside a thread.
        ..replyToChannel = true;
    }
  }

  void _finishSend(
    Completer<ChatMessage> completer,
    GroupChannel channel,
    BaseMessage message,
    SendbirdException? error,
  ) {
    if (completer.isCompleted) return;
    final mapped = error == null ? _mapMessage(message, channel) : null;
    if (error != null) {
      completer.completeError(error);
    } else if (mapped == null) {
      completer.completeError(StateError('Unsupported message type'));
    } else {
      _remember(channel.channelUrl, message);
      completer.complete(mapped);
    }
  }

  @override
  Future<ChatMessage> editMessage(String channelUrl, String messageId, String newText) async {
    final channel = await _channel(channelUrl);
    final updated = await channel.updateUserMessage(
      int.parse(messageId),
      UserMessageUpdateParams(message: newText),
    );
    _remember(channelUrl, updated);
    return _mapMessage(updated, channel)!;
  }

  @override
  Future<void> deleteMessage(String channelUrl, String messageId) async {
    final channel = await _channel(channelUrl);
    final id = int.parse(messageId);
    await channel.deleteMessage(id);
    _messages[channelUrl]?.remove(id);
  }

  @override
  Future<void> setReaction(String channelUrl, String messageId, String key, {required bool on}) async {
    final channel = await _channel(channelUrl);
    final message = _messages[channelUrl]?[int.parse(messageId)];
    if (message == null) throw StateError('Message not loaded');
    if (on) {
      await channel.addReaction(message, key);
    } else {
      await channel.deleteReaction(message, key);
    }
  }

  @override
  Future<void> markRead(String channelUrl) async {
    final channel = await _channel(channelUrl);
    await channel.markAsRead();
  }

  @override
  void setTyping(String channelUrl, {required bool typing}) {
    final channel = _channels[channelUrl];
    if (channel == null) return;
    if (typing) {
      channel.startTyping();
    } else {
      channel.endTyping();
    }
  }

  // ------------------------------------------------------------------- mapping

  void _remember(String channelUrl, BaseMessage m) {
    (_messages[channelUrl] ??= {})[m.messageId] = m;
  }

  ChatChannel _mapChannel(GroupChannel ch) {
    final myId = currentUserId;
    final others = ch.members.where((m) => m.userId != myId).toList();
    final isDirect = ch.isDistinct && ch.members.length <= 2;
    final String title;
    if (isDirect && others.isNotEmpty) {
      title = _name(others.first.nickname, others.first.userId);
    } else if (ch.name.isNotEmpty && ch.name != 'Group Channel') {
      title = ch.name;
    } else if (others.isNotEmpty) {
      title = others.map((m) => _name(m.nickname, m.userId)).join(', ');
    } else {
      title = 'Chat';
    }

    final last = ch.lastMessage;
    String? preview;
    if (last != null) {
      final text = _previewOf(last);
      final senderId = last.sender?.userId ?? '';
      final who = senderId == myId
          ? 'You: '
          : (!isDirect ? '${_name(last.sender?.nickname ?? '', senderId)}: ' : '');
      preview = '$who$text';
    }
    final at = last?.createdAt ?? ch.createdAt;

    return ChatChannel(
      url: ch.channelUrl,
      title: title,
      members: ch.members
          .map((m) => ChatMember(userId: m.userId, nickname: m.nickname, profileUrl: m.profileUrl))
          .toList(),
      memberCount: ch.memberCount,
      unreadCount: ch.unreadMessageCount,
      lastMessage: preview,
      lastMessageAt: at == null ? null : DateTime.fromMillisecondsSinceEpoch(at),
      isDirect: isDirect,
      coverUrl: ch.coverUrl,
    );
  }

  ChatMessage? _mapMessage(BaseMessage m, GroupChannel channel) {
    final myId = currentUserId;
    final sender = m.sender;
    final senderId = sender?.userId ?? '';
    final mine = senderId.isNotEmpty && senderId == myId;

    var kind = MessageKind.text;
    String? attachmentUrl;
    String? attachmentName;
    if (m is FileMessage) {
      kind = (m.type ?? '').startsWith('image/') ? MessageKind.image : MessageKind.file;
      attachmentUrl = m.secureUrl;
      attachmentName = m.name;
    } else if (m is! UserMessage) {
      return null; // Admin/system messages are not shown.
    }

    return ChatMessage(
      id: m.messageId.toString(),
      text: m.message,
      senderId: senderId,
      senderName: _name(sender?.nickname ?? '', senderId),
      createdAt: DateTime.fromMillisecondsSinceEpoch(m.createdAt),
      isMine: mine,
      replyTo: _mapParent(m.parentMessage, myId),
      kind: kind,
      attachmentUrl: attachmentUrl,
      attachmentName: attachmentName,
      reactions: [
        for (final r in m.reactions ?? const <Reaction>[])
          if (r.userIds.isNotEmpty) ChatReaction(key: r.key, userIds: List.of(r.userIds)),
      ],
      edited: m.updatedAt > 0 && m.updatedAt > m.createdAt,
      seen: mine && _isSeen(channel, m),
    );
  }

  bool _isSeen(GroupChannel channel, BaseMessage m) =>
      channel.members.length > 1 && channel.getUnreadMembers(m).isEmpty;

  Set<String> _seenIds(GroupChannel channel) {
    final myId = currentUserId;
    final cache = _messages[channel.channelUrl];
    if (cache == null) return const {};
    return {
      for (final m in cache.values)
        if (m.sender?.userId == myId && _isSeen(channel, m)) m.messageId.toString(),
    };
  }

  ReplyPreview? _mapParent(BaseMessage? parent, String? myId) {
    if (parent == null) return null;
    final senderId = parent.sender?.userId ?? '';
    return ReplyPreview(
      messageId: parent.messageId.toString(),
      senderName: senderId == myId ? 'You' : _name(parent.sender?.nickname ?? '', senderId),
      text: _previewOf(parent),
    );
  }

  static String _previewOf(BaseMessage m) {
    if (m is FileMessage) {
      return (m.type ?? '').startsWith('image/') ? '\u{1F4F7} Photo' : '\u{1F4CE} ${m.name ?? 'File'}';
    }
    return m.message;
  }

  static String _name(String nickname, String userId) => nickname.isNotEmpty ? nickname : userId;
}

/// Turns Sendbird channel callbacks into [ChatEvent]s.
class _ChannelBridge extends GroupChannelHandler {
  _ChannelBridge(this._s);

  final SendbirdChatService _s;

  void _emitChannel(GroupChannel channel) {
    _s._channels[channel.channelUrl] = channel;
    _s._events.add(ChannelChanged(_s._mapChannel(channel)));
  }

  @override
  void onMessageReceived(BaseChannel channel, BaseMessage message) {
    if (channel is! GroupChannel) return;
    _s._remember(channel.channelUrl, message);
    final mapped = _s._mapMessage(message, channel);
    if (mapped != null) _s._events.add(MessageReceived(channel.channelUrl, mapped));
    _emitChannel(channel);
  }

  @override
  void onMessageUpdated(BaseChannel channel, BaseMessage message) {
    if (channel is! GroupChannel) return;
    _s._remember(channel.channelUrl, message);
    final mapped = _s._mapMessage(message, channel);
    if (mapped != null) _s._events.add(MessageUpdated(channel.channelUrl, mapped));
  }

  @override
  void onMessageDeleted(BaseChannel channel, int messageId) {
    _s._messages[channel.channelUrl]?.remove(messageId);
    _s._events.add(MessageDeleted(channel.channelUrl, messageId.toString()));
    if (channel is GroupChannel) _emitChannel(channel);
  }

  @override
  void onReactionUpdated(BaseChannel channel, ReactionEvent event) {
    _s._events.add(ReactionChanged(
      channel.channelUrl,
      messageId: event.messageId.toString(),
      key: event.key,
      userId: event.userId,
      added: event.operation == ReactionEventAction.add,
    ));
  }

  @override
  void onTypingStatusUpdated(GroupChannel channel) {
    final myId = _s.currentUserId;
    final names = [
      for (final u in channel.getTypingUsers())
        if (u.userId != myId) SendbirdChatService._name(u.nickname, u.userId),
    ];
    _s._events.add(TypingChanged(channel.channelUrl, names));
  }

  @override
  void onReadStatusUpdated(GroupChannel channel) {
    _s._events.add(ReadReceiptsChanged(channel.channelUrl, _s._seenIds(channel)));
  }

  @override
  void onDeliveryStatusUpdated(GroupChannel channel) {
    _s._events.add(ReadReceiptsChanged(channel.channelUrl, _s._seenIds(channel)));
  }

  @override
  void onChannelChanged(BaseChannel channel) {
    if (channel is GroupChannel) _emitChannel(channel);
  }

  @override
  void onChannelDeleted(String channelUrl, ChannelType channelType) {
    _s._channels.remove(channelUrl);
    _s._messages.remove(channelUrl);
    _s._events.add(ChannelRemoved(channelUrl));
  }

  @override
  void onUserReceivedInvitation(GroupChannel channel, List<User> invitees, User? inviter) =>
      _emitChannel(channel);

  @override
  void onUserJoined(GroupChannel channel, User user) => _emitChannel(channel);

  @override
  void onUserLeft(GroupChannel channel, User user) => _emitChannel(channel);

  @override
  void onChannelHidden(GroupChannel channel) => _s._events.add(ChannelRemoved(channel.channelUrl));
}

class _ConnectionBridge extends ConnectionHandler {
  _ConnectionBridge(this._sink);

  final StreamController<ChatConnection> _sink;

  @override
  void onConnected(String userId) => _sink.add(ChatConnection.online);

  @override
  void onDisconnected(String userId) => _sink.add(ChatConnection.offline);

  @override
  void onReconnectStarted() => _sink.add(ChatConnection.reconnecting);

  @override
  void onReconnectSucceeded() => _sink.add(ChatConnection.online);

  @override
  void onReconnectFailed() => _sink.add(ChatConnection.offline);
}
