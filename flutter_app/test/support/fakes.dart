import 'dart:async';

import 'package:al_balag_poc/features/chat/chat_models.dart';
import 'package:al_balag_poc/features/chat/chat_service.dart';
import 'package:al_balag_poc/features/meeting/meeting_service.dart';

class FakeChatService implements ChatService {
  final incoming = StreamController<ChatMessage>.broadcast();
  final connection = StreamController<ChatConnection>.broadcast();

  List<ChatMessage> history = [];
  Object? connectError;
  Object? sendError;
  final sent = <String>[];
  bool disconnected = false;

  @override
  Stream<ChatMessage> get incomingMessages => incoming.stream;

  @override
  Stream<ChatConnection> get connectionChanges => connection.stream;

  @override
  Future<void> connect({required String userId, String? nickname}) async {
    if (connectError != null) throw connectError!;
  }

  @override
  Future<List<ChatMessage>> joinRoomAndLoadHistory() async => history;

  @override
  Future<ChatMessage> send(String text) async {
    if (sendError != null) throw sendError!;
    sent.add(text);
    return ChatMessage(
      id: 'srv-${sent.length}',
      text: text,
      senderId: 'me',
      senderName: 'Me',
      createdAt: DateTime.now(),
      isMine: true,
    );
  }

  @override
  Future<void> disconnect() async => disconnected = true;
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

ChatMessage msg(String id, String text, {bool mine = false, DateTime? at, String sender = 'bob'}) =>
    ChatMessage(
      id: id,
      text: text,
      senderId: mine ? 'me' : sender,
      senderName: mine ? 'Me' : sender,
      createdAt: at ?? DateTime(2026, 1, 1, 12),
      isMine: mine,
    );
