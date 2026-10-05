import 'dart:async';

import 'package:al_balag_poc/features/chat/chat_models.dart';
import 'package:al_balag_poc/features/chat/chat_service.dart';
import 'package:al_balag_poc/features/meeting/meeting_service.dart';

class FakeChatService implements ChatService {
  final eventStream = StreamController<ChatEvent>.broadcast();
  final connection = StreamController<ChatConnection>.broadcast();

  String? userId = 'alice';

  /// What the chat list shows.
  List<ChatChannel> channels = [chan()];

  /// Messages per channel url (any order; sorted when served).
  final messagesByChannel = <String, List<ChatMessage>>{};

  Object? connectError;
  Object? loadChannelsError;
  Object? loadMessagesError;
  Object? sendError;
  Object? editError;
  Object? deleteError;
  Object? reactionError;
  Object? createError;

  final sent = <String>[];
  final replies = <ReplyPreview?>[];
  final images = <String>[];
  final edits = <({String id, String text})>[];
  final deleted = <String>[];
  final reactions = <({String id, String key, bool on})>[];
  final readMarks = <String>[];
  final typingCalls = <bool>[];
  final created = <({List<String> ids, String? name})>[];
  final left = <String>[];
  bool disconnected = false;
  bool joinedDemo = false;
  int _serverId = 1000;

  /// Convenience for tests that only care about the demo room.
  set history(List<ChatMessage> messages) => messagesByChannel['poc-demo-room'] = messages;

  @override
  Stream<ChatEvent> get events => eventStream.stream;

  @override
  Stream<ChatConnection> get connectionChanges => connection.stream;

  @override
  String? get currentUserId => userId;

  @override
  Future<void> connect({required String userId, String? nickname}) async {
    if (connectError != null) throw connectError!;
  }

  @override
  Future<void> disconnect() async => disconnected = true;

  @override
  Future<void> joinDemoRoom() async => joinedDemo = true;

  @override
  Future<List<ChatChannel>> loadChannels() async {
    if (loadChannelsError != null) throw loadChannelsError!;
    return channels;
  }

  @override
  Future<ChatChannel> createChannel({required List<String> userIds, String? name}) async {
    if (createError != null) throw createError!;
    created.add((ids: userIds, name: name));
    final channel = ChatChannel(
      url: 'new-${created.length}',
      title: userIds.length == 1 ? userIds.first : (name ?? userIds.join(', ')),
      isDirect: userIds.length == 1,
      memberCount: userIds.length + 1,
      lastMessageAt: DateTime(2026, 1, 2),
    );
    return channel;
  }

  @override
  Future<void> leaveChannel(String channelUrl) async => left.add(channelUrl);

  @override
  Future<List<ChatMessage>> loadMessages(String channelUrl, {DateTime? before, int limit = 30}) async {
    if (loadMessagesError != null) throw loadMessagesError!;
    final all = [...?messagesByChannel[channelUrl]]..sort((a, b) => a.createdAt.compareTo(b.createdAt));
    final older = before == null ? all : all.where((m) => m.createdAt.isBefore(before)).toList();
    return older.length <= limit ? older : older.sublist(older.length - limit);
  }

  ChatMessage _echo(String text, ReplyPreview? replyTo, {MessageKind kind = MessageKind.text}) {
    final id = '${++_serverId}';
    return ChatMessage(
      id: id,
      text: text,
      senderId: userId ?? 'me',
      senderName: 'Me',
      createdAt: DateTime.now(),
      isMine: true,
      replyTo: replyTo,
      kind: kind,
      attachmentUrl: kind == MessageKind.image ? 'https://example.com/$id.jpg' : null,
    );
  }

  @override
  Future<ChatMessage> sendText(String channelUrl, String text, {ReplyPreview? replyTo}) async {
    if (sendError != null) throw sendError!;
    sent.add(text);
    replies.add(replyTo);
    return _echo(text, replyTo);
  }

  @override
  Future<ChatMessage> sendImage(String channelUrl, String filePath, {ReplyPreview? replyTo}) async {
    if (sendError != null) throw sendError!;
    images.add(filePath);
    return _echo('', replyTo, kind: MessageKind.image);
  }

  @override
  Future<ChatMessage> editMessage(String channelUrl, String messageId, String newText) async {
    if (editError != null) throw editError!;
    edits.add((id: messageId, text: newText));
    return ChatMessage(
      id: messageId,
      text: newText,
      senderId: userId ?? 'me',
      senderName: 'Me',
      createdAt: DateTime.now(),
      isMine: true,
      edited: true,
    );
  }

  @override
  Future<void> deleteMessage(String channelUrl, String messageId) async {
    if (deleteError != null) throw deleteError!;
    deleted.add(messageId);
  }

  @override
  Future<void> setReaction(String channelUrl, String messageId, String key, {required bool on}) async {
    if (reactionError != null) throw reactionError!;
    reactions.add((id: messageId, key: key, on: on));
  }

  @override
  Future<void> markRead(String channelUrl) async => readMarks.add(channelUrl);

  @override
  void setTyping(String channelUrl, {required bool typing}) => typingCalls.add(typing);

  /// Pushes a server event to the app.
  void emit(ChatEvent event) => eventStream.add(event);
}

class FakeMeetingService implements MeetingService {
  final updates = StreamController<MeetingStatusUpdate>.broadcast();
  MeetingException? joinError;
  final joined = <({String number, String name, String? passcode})>[];

  @override
  Stream<MeetingStatusUpdate> get statusUpdates => updates.stream;

  @override
  Future<void> join({
    required String meetingNumber,
    required String displayName,
    String? passcode,
  }) async {
    if (joinError != null) throw joinError!;
    joined.add((number: meetingNumber, name: displayName, passcode: passcode));
  }
}

const demoUrl = 'poc-demo-room';

ChatChannel chan({
  String url = demoUrl,
  String title = 'POC Demo Room',
  String? lastMessage = 'bob: Welcome to the room',
  DateTime? at,
  int unread = 0,
  bool direct = false,
}) =>
    ChatChannel(
      url: url,
      title: title,
      memberCount: 3,
      unreadCount: unread,
      lastMessage: lastMessage,
      lastMessageAt: at ?? DateTime(2026, 1, 1, 12),
      isDirect: direct,
    );

ChatMessage msg(
  String id,
  String text, {
  bool mine = false,
  DateTime? at,
  String sender = 'bob',
  List<ChatReaction> reactions = const [],
}) =>
    ChatMessage(
      id: id,
      text: text,
      senderId: mine ? 'alice' : sender,
      senderName: mine ? 'Me' : sender,
      createdAt: at ?? DateTime(2026, 1, 1, 12),
      isMine: mine,
      reactions: reactions,
    );
