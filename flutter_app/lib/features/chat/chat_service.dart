import 'chat_models.dart';

/// Something that happened on the server, pushed to the app in real time.
sealed class ChatEvent {
  const ChatEvent(this.channelUrl);

  final String channelUrl;
}

class MessageReceived extends ChatEvent {
  const MessageReceived(super.channelUrl, this.message);
  final ChatMessage message;
}

class MessageUpdated extends ChatEvent {
  const MessageUpdated(super.channelUrl, this.message);
  final ChatMessage message;
}

class MessageDeleted extends ChatEvent {
  const MessageDeleted(super.channelUrl, this.messageId);
  final String messageId;
}

class ReactionChanged extends ChatEvent {
  const ReactionChanged(
    super.channelUrl, {
    required this.messageId,
    required this.key,
    required this.userId,
    required this.added,
  });
  final String messageId;
  final String key;
  final String userId;
  final bool added;
}

/// Names of the other people currently typing in a channel.
class TypingChanged extends ChatEvent {
  const TypingChanged(super.channelUrl, this.names);
  final List<String> names;
}

/// The ids of my messages that everyone else has now read.
class ReadReceiptsChanged extends ChatEvent {
  const ReadReceiptsChanged(super.channelUrl, this.seenMessageIds);
  final Set<String> seenMessageIds;
}

/// A channel was created or changed (new last message, unread count, members, ...).
class ChannelChanged extends ChatEvent {
  ChannelChanged(this.channel) : super(channel.url);
  final ChatChannel channel;
}

class ChannelRemoved extends ChatEvent {
  const ChannelRemoved(super.channelUrl);
}

/// What the app needs from a chat backend. Implemented by Sendbird; faked in tests.
abstract class ChatService {
  Stream<ChatEvent> get events;

  Stream<ChatConnection> get connectionChanges;

  /// The signed-in user's id once connected.
  String? get currentUserId;

  Future<void> connect({required String userId, String? nickname});

  Future<void> disconnect();

  /// Makes sure the shared public demo room exists and that the current user is in it.
  Future<void> joinDemoRoom();

  /// My conversations, newest activity first.
  Future<List<ChatChannel>> loadChannels();

  /// Starts a chat with [userIds]. One id gives a direct chat (re-using an existing one);
  /// several ids give a group named [name].
  Future<ChatChannel> createChannel({required List<String> userIds, String? name});

  Future<void> leaveChannel(String channelUrl);

  /// Up to [limit] messages older than [before] (or the newest ones), oldest first.
  Future<List<ChatMessage>> loadMessages(String channelUrl, {DateTime? before, int limit = 30});

  /// Completes with the delivered message or throws on failure.
  Future<ChatMessage> sendText(String channelUrl, String text, {ReplyPreview? replyTo});

  Future<ChatMessage> sendImage(String channelUrl, String filePath, {ReplyPreview? replyTo});

  Future<ChatMessage> editMessage(String channelUrl, String messageId, String newText);

  Future<void> deleteMessage(String channelUrl, String messageId);

  Future<void> setReaction(String channelUrl, String messageId, String key, {required bool on});

  Future<void> markRead(String channelUrl);

  /// Tells the others that I started or stopped typing.
  void setTyping(String channelUrl, {required bool typing});
}
