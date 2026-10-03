import 'chat_models.dart';

/// What the app needs from a chat backend. Implemented by Sendbird; faked in tests.
abstract class ChatService {
  /// Messages sent by other users in the joined room.
  Stream<ChatMessage> get incomingMessages;

  Stream<ChatConnection> get connectionChanges;

  Future<void> connect({required String userId, String? nickname});

  /// Joins (creating if needed) the shared demo room and returns recent history, oldest first.
  Future<List<ChatMessage>> joinRoomAndLoadHistory();

  /// Sends [text] (optionally as a reply to [replyTo]); completes with the delivered message
  /// or throws on failure.
  Future<ChatMessage> send(String text, {ReplyPreview? replyTo});

  Future<void> disconnect();
}
