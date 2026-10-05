enum DeliveryStatus { sending, sent, failed }

/// Connection state shown to the user.
enum ChatConnection { connecting, online, reconnecting, offline }

enum MessageKind { text, image, file }

/// A short quote of the message being replied to.
class ReplyPreview {
  const ReplyPreview({required this.messageId, required this.senderName, required this.text});

  /// The replied-to message's server id (Sendbird message id).
  final String messageId;
  final String senderName;
  final String text;
}

class ChatMember {
  const ChatMember({required this.userId, required this.nickname, this.profileUrl = ''});

  final String userId;
  final String nickname;
  final String profileUrl;

  String get displayName => nickname.isNotEmpty ? nickname : userId;
}

/// A conversation (Sendbird group channel) as shown in the chat list.
class ChatChannel {
  const ChatChannel({
    required this.url,
    required this.title,
    this.members = const [],
    this.memberCount = 0,
    this.unreadCount = 0,
    this.lastMessage,
    this.lastMessageAt,
    this.isDirect = false,
    this.coverUrl = '',
  });

  final String url;

  /// Ready-to-display name: the other person for a direct chat, the group name otherwise.
  final String title;
  final List<ChatMember> members;
  final int memberCount;
  final int unreadCount;

  /// Preview text of the newest message, e.g. "Alice: see you soon".
  final String? lastMessage;
  final DateTime? lastMessageAt;
  final bool isDirect;
  final String coverUrl;

  ChatChannel copyWith({int? unreadCount}) => ChatChannel(
        url: url,
        title: title,
        members: members,
        memberCount: memberCount,
        unreadCount: unreadCount ?? this.unreadCount,
        lastMessage: lastMessage,
        lastMessageAt: lastMessageAt,
        isDirect: isDirect,
        coverUrl: coverUrl,
      );
}

/// One emoji and the users who reacted with it.
class ChatReaction {
  const ChatReaction({required this.key, required this.userIds});

  final String key;
  final List<String> userIds;

  int get count => userIds.length;
  bool reactedBy(String? userId) => userId != null && userIds.contains(userId);
}

/// SDK-independent message model so the UI and tests never touch Sendbird types.
class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.text,
    required this.senderId,
    required this.senderName,
    required this.createdAt,
    required this.isMine,
    this.status = DeliveryStatus.sent,
    this.replyTo,
    this.kind = MessageKind.text,
    this.attachmentUrl,
    this.attachmentName,
    this.localPath,
    this.reactions = const [],
    this.edited = false,
    this.seen = false,
  });

  final String id;
  final String text;
  final String senderId;
  final String senderName;
  final DateTime createdAt;
  final bool isMine;
  final DeliveryStatus status;

  /// Set when this message is a reply to another message.
  final ReplyPreview? replyTo;

  final MessageKind kind;

  /// Remote URL of an image/file message.
  final String? attachmentUrl;
  final String? attachmentName;

  /// Local file of an image that is still being uploaded (shown until the server URL arrives).
  final String? localPath;

  final List<ChatReaction> reactions;
  final bool edited;

  /// Everyone else in the channel has read this (only meaningful for my own messages).
  final bool seen;

  bool get isDelivered => status == DeliveryStatus.sent && int.tryParse(id) != null;

  /// Only delivered messages have a server id that can be replied to or reacted to.
  bool get canReplyTo => isDelivered;

  /// Only my own delivered text messages can be edited.
  bool get canEdit => isMine && isDelivered && kind == MessageKind.text;

  bool get canDelete => isMine && isDelivered;

  /// What to show in quotes and chat-list previews.
  String get previewText => switch (kind) {
        MessageKind.text => text,
        MessageKind.image => '\u{1F4F7} Photo',
        MessageKind.file => '\u{1F4CE} ${attachmentName ?? 'File'}',
      };

  ReplyPreview toReplyPreview() =>
      ReplyPreview(messageId: id, senderName: isMine ? 'You' : senderName, text: previewText);

  ChatMessage copyWith({
    String? id,
    String? text,
    DeliveryStatus? status,
    DateTime? createdAt,
    ReplyPreview? replyTo,
    List<ChatReaction>? reactions,
    bool? edited,
    bool? seen,
  }) =>
      ChatMessage(
        id: id ?? this.id,
        text: text ?? this.text,
        senderId: senderId,
        senderName: senderName,
        createdAt: createdAt ?? this.createdAt,
        isMine: isMine,
        status: status ?? this.status,
        replyTo: replyTo ?? this.replyTo,
        kind: kind,
        attachmentUrl: attachmentUrl,
        attachmentName: attachmentName,
        localPath: localPath,
        reactions: reactions ?? this.reactions,
        edited: edited ?? this.edited,
        seen: seen ?? this.seen,
      );
}

/// The reactions offered in the picker.
const quickReactions = ['\u{1F44D}', '❤️', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F64F}'];
