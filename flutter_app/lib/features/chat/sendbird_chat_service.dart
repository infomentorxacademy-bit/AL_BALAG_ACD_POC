import 'dart:async';

import 'package:sendbird_chat_sdk/sendbird_chat_sdk.dart';

import '../../core/config.dart';
import 'chat_models.dart';
import 'chat_service.dart';

class SendbirdChatService implements ChatService {
  SendbirdChatService({required this.appId});

  final String appId;

  static const _handlerKey = 'poc-chat-handler';

  final _incoming = StreamController<ChatMessage>.broadcast();
  final _connection = StreamController<ChatConnection>.broadcast();

  bool _initialized = false;
  GroupChannel? _channel;

  @override
  Stream<ChatMessage> get incomingMessages => _incoming.stream;

  @override
  Stream<ChatConnection> get connectionChanges => _connection.stream;

  @override
  Future<void> connect({required String userId, String? nickname}) async {
    if (!_initialized) {
      await SendbirdChat.init(appId: appId);
      SendbirdChat.addConnectionHandler(
        _handlerKey,
        _ConnectionBridge(_connection),
      );
      _initialized = true;
    }
    _connection.add(ChatConnection.connecting);
    await SendbirdChat.connect(userId, nickname: nickname);
    _connection.add(ChatConnection.online);
  }

  @override
  Future<List<ChatMessage>> joinRoomAndLoadHistory() async {
    final channel = await _getOrCreateRoom();
    if (channel.myMemberState != MemberState.joined) {
      await channel.join();
    }
    _channel = channel;

    SendbirdChat.addChannelHandler(
      _handlerKey,
      _MessageBridge(channel.channelUrl, (m) => _incoming.add(_map(m))),
    );

    final params = MessageListParams()
      ..previousResultSize = 50
      ..nextResultSize = 0
      ..reverse = false
      // Include the quoted parent of replies so they render with their context.
      ..includeParentMessageInfo = true
      ..replyType = ReplyType.all;
    final history = await channel.getMessagesByTimestamp(
      DateTime.now().millisecondsSinceEpoch,
      params,
    );
    return history.whereType<UserMessage>().map(_map).toList()
      ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
  }

  Future<GroupChannel> _getOrCreateRoom() async {
    try {
      return await GroupChannel.getChannel(AppConfig.demoChannelUrl);
    } on SendbirdException {
      // Not found: the first user to arrive creates the shared room.
      final params = GroupChannelCreateParams()
        ..channelUrl = AppConfig.demoChannelUrl
        ..name = AppConfig.demoChannelName
        ..isPublic = true
        ..isDistinct = false;
      return GroupChannel.createChannel(params);
    }
  }

  @override
  Future<ChatMessage> send(String text, {ReplyPreview? replyTo}) {
    final channel = _channel;
    if (channel == null) {
      return Future.error(StateError('Not in a channel yet'));
    }
    final completer = Completer<ChatMessage>();
    final params = UserMessageCreateParams(message: text);
    final parentId = replyTo == null ? null : int.tryParse(replyTo.messageId);
    if (parentId != null) {
      params
        ..parentMessageId = parentId
        // Show the reply in the main conversation, not only inside a thread.
        ..replyToChannel = true;
    }
    channel.sendUserMessage(
      params,
      handler: (message, error) {
        if (error != null) {
          completer.completeError(error);
        } else {
          completer.complete(_map(message));
        }
      },
    );
    return completer.future;
  }

  @override
  Future<void> disconnect() async {
    SendbirdChat.removeChannelHandler(_handlerKey);
    _channel = null;
    if (_initialized) await SendbirdChat.disconnect();
  }

  ChatMessage _map(BaseMessage m) {
    final sender = m.sender;
    final myId = SendbirdChat.currentUser?.userId;
    final senderId = sender?.userId ?? '';
    return ChatMessage(
      id: m.messageId.toString(),
      text: m.message,
      senderId: senderId,
      senderName: (sender?.nickname.isNotEmpty ?? false) ? sender!.nickname : senderId,
      createdAt: DateTime.fromMillisecondsSinceEpoch(m.createdAt),
      isMine: senderId.isNotEmpty && senderId == myId,
      replyTo: _mapParent(m.parentMessage, myId),
    );
  }

  ReplyPreview? _mapParent(BaseMessage? parent, String? myId) {
    if (parent == null) return null;
    final senderId = parent.sender?.userId ?? '';
    final nickname = parent.sender?.nickname ?? '';
    return ReplyPreview(
      messageId: parent.messageId.toString(),
      senderName: senderId == myId ? 'You' : (nickname.isNotEmpty ? nickname : senderId),
      text: parent.message,
    );
  }
}

class _MessageBridge extends GroupChannelHandler {
  _MessageBridge(this.channelUrl, this.onUserMessage);

  final String channelUrl;
  final void Function(UserMessage) onUserMessage;

  @override
  void onMessageReceived(BaseChannel channel, BaseMessage message) {
    if (channel.channelUrl == channelUrl && message is UserMessage) {
      onUserMessage(message);
    }
  }
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
