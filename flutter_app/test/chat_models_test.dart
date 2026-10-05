import 'package:al_balag_poc/features/chat/chat_models.dart';
import 'package:al_balag_poc/features/chat/new_chat_sheet.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

void main() {
  group('parseUserIds', () {
    test('splits on commas and spaces, trims and removes duplicates', () {
      expect(parseUserIds('bob, carol  dave,,bob'), ['bob', 'carol', 'dave']);
    });

    test('drops my own id', () {
      expect(parseUserIds('alice, bob', exclude: 'alice'), ['bob']);
    });

    test('empty input gives nothing', () {
      expect(parseUserIds('  , '), isEmpty);
    });
  });

  group('ChatMessage', () {
    test('only delivered messages can be replied to, reacted to or edited', () {
      final delivered = msg('12', 'hi', mine: true);
      expect(delivered.canReplyTo, isTrue);
      expect(delivered.canEdit, isTrue);
      expect(delivered.canDelete, isTrue);

      final pending = delivered.copyWith(id: 'local-1', status: DeliveryStatus.sending);
      expect(pending.canReplyTo, isFalse);
      expect(pending.canEdit, isFalse);
      expect(pending.canDelete, isFalse);
    });

    test('other people\'s messages cannot be edited or deleted', () {
      final theirs = msg('12', 'hi', sender: 'bob');
      expect(theirs.canEdit, isFalse);
      expect(theirs.canDelete, isFalse);
      expect(theirs.canReplyTo, isTrue);
    });

    test('photos are previewed as text in quotes and lists', () {
      final photo = ChatMessage(
        id: '1',
        text: '',
        senderId: 'bob',
        senderName: 'bob',
        createdAt: DateTime(2026),
        isMine: false,
        kind: MessageKind.image,
      );
      expect(photo.previewText, contains('Photo'));
      expect(photo.canEdit, isFalse);
    });
  });

  test('ChatReaction counts and knows who reacted', () {
    const r = ChatReaction(key: '\u{1F44D}', userIds: ['a', 'b']);
    expect(r.count, 2);
    expect(r.reactedBy('a'), isTrue);
    expect(r.reactedBy('z'), isFalse);
    expect(r.reactedBy(null), isFalse);
  });

  test('ChatMember falls back to the user id when there is no nickname', () {
    expect(const ChatMember(userId: 'bob', nickname: '').displayName, 'bob');
    expect(const ChatMember(userId: 'bob', nickname: 'Bob B').displayName, 'Bob B');
  });
}
