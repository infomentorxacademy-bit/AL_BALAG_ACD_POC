enum DeliveryStatus { sending, sent, failed }

/// Connection state shown to the user.
enum ChatConnection { connecting, online, reconnecting, offline }

/// A short quote of the message being replied to.
class ReplyPreview {
  const ReplyPreview({required this.messageId, required this.senderName, required this.text});

  /// The replied-to message's server id (Sendbird message id).
  final String messageId;
  final String senderName;
  final String text;
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

  /// Only delivered messages have a server id that can be replied to.
  bool get canReplyTo => status == DeliveryStatus.sent && int.tryParse(id) != null;

  ReplyPreview toReplyPreview() =>
      ReplyPreview(messageId: id, senderName: isMine ? 'You' : senderName, text: text);

  ChatMessage copyWith({String? id, DeliveryStatus? status, DateTime? createdAt, ReplyPreview? replyTo}) =>
      ChatMessage(
        id: id ?? this.id,
        text: text,
        senderId: senderId,
        senderName: senderName,
        createdAt: createdAt ?? this.createdAt,
        isMine: isMine,
        status: status ?? this.status,
        replyTo: replyTo ?? this.replyTo,
      );
}
