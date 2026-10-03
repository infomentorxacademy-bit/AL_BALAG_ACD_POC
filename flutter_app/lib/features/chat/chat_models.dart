enum DeliveryStatus { sending, sent, failed }

/// Connection state shown to the user.
enum ChatConnection { connecting, online, reconnecting, offline }

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
  });

  final String id;
  final String text;
  final String senderId;
  final String senderName;
  final DateTime createdAt;
  final bool isMine;
  final DeliveryStatus status;

  ChatMessage copyWith({String? id, DeliveryStatus? status, DateTime? createdAt}) =>
      ChatMessage(
        id: id ?? this.id,
        text: text,
        senderId: senderId,
        senderName: senderName,
        createdAt: createdAt ?? this.createdAt,
        isMine: isMine,
        status: status ?? this.status,
      );
}
