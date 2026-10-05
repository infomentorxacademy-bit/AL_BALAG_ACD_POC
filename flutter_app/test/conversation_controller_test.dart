import 'package:al_balag_poc/features/chat/channel_list_controller.dart';
import 'package:al_balag_poc/features/chat/chat_models.dart';
import 'package:al_balag_poc/features/chat/chat_providers.dart';
import 'package:al_balag_poc/features/chat/chat_service.dart';
import 'package:al_balag_poc/features/chat/conversation_controller.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

void main() {
  late FakeChatService service;
  late ProviderContainer container;
  String? pickedPath = '/photos/cat.jpg';
  Object? pickerError;

  setUp(() {
    service = FakeChatService();
    pickedPath = '/photos/cat.jpg';
    pickerError = null;
    container = ProviderContainer(overrides: [
      chatServiceProvider.overrideWithValue(service),
      imagePickerProvider.overrideWithValue(() async {
        if (pickerError != null) throw pickerError!;
        return pickedPath;
      }),
    ]);
    addTearDown(container.dispose);
  });

  ConversationController controller() => container.read(conversationControllerProvider.notifier);
  ConversationState state() => container.read(conversationControllerProvider);
  Future<void> open() => controller().open(chan());
  Future<void> pump() => Future<void>.delayed(Duration.zero);

  test('open loads history oldest first, becomes ready and marks the chat read', () async {
    service.history = [
      msg('2', 'second', at: DateTime(2026, 1, 1, 12, 5)),
      msg('1', 'first', at: DateTime(2026, 1, 1, 12, 0)),
    ];
    await open();

    expect(state().phase, ChatPhase.ready);
    expect(state().messages.map((m) => m.text), ['first', 'second']);
    expect(service.readMarks, [demoUrl]);
  });

  test('open failure surfaces an error and can be retried', () async {
    service.loadMessagesError = Exception('boom');
    await open();
    expect(state().phase, ChatPhase.error);
    expect(state().error, contains('boom'));

    service.loadMessagesError = null;
    await open();
    expect(state().phase, ChatPhase.ready);
    expect(state().error, isNull);
  });

  test('opening a chat clears its unread badge in the list', () async {
    container.read(channelListControllerProvider.notifier);
    service.channels = [chan(unread: 4)];
    await container.read(channelListControllerProvider.notifier).start(userId: 'alice', nickname: 'A');
    expect(container.read(channelListControllerProvider).totalUnread, 4);

    await open();
    expect(container.read(channelListControllerProvider).totalUnread, 0);
  });

  test('close resets the state', () async {
    await open();
    controller().close();
    expect(state().phase, ChatPhase.idle);
    expect(state().channel, isNull);
  });

  group('sending', () {
    test('send shows the message and ends as sent with the server id', () async {
      await open();
      await controller().send('  hi there  ');

      expect(service.sent, ['hi there']);
      final mine = state().messages.single;
      expect(mine.status, DeliveryStatus.sent);
      expect(mine.isDelivered, isTrue);
    });

    test('blank messages are ignored', () async {
      await open();
      await controller().send('   ');
      expect(state().messages, isEmpty);
      expect(service.sent, isEmpty);
    });

    test('failed send is marked failed and retry delivers it', () async {
      await open();
      service.sendError = Exception('offline');
      await controller().send('hello');
      expect(state().messages.single.status, DeliveryStatus.failed);

      service.sendError = null;
      await controller().retry(state().messages.single);
      expect(state().messages.single.status, DeliveryStatus.sent);
      expect(service.sent, ['hello']);
    });

    test('sending a photo uploads it and ends as an image message', () async {
      await open();
      await controller().sendImage();

      expect(service.images, ['/photos/cat.jpg']);
      final m = state().messages.single;
      expect(m.kind, MessageKind.image);
      expect(m.status, DeliveryStatus.sent);
      expect(m.attachmentUrl, isNotNull);
    });

    test('cancelling the gallery sends nothing', () async {
      await open();
      pickedPath = null;
      await controller().sendImage();
      expect(state().messages, isEmpty);
    });

    test('a gallery error shows a notice', () async {
      await open();
      pickerError = Exception('no permission');
      await controller().sendImage();
      expect(state().notice, contains('gallery'));
    });

    test('a failed photo can be retried', () async {
      await open();
      service.sendError = Exception('offline');
      await controller().sendImage();
      expect(state().messages.single.status, DeliveryStatus.failed);
      service.sendError = null;
      await controller().retry(state().messages.single);
      expect(service.images, ['/photos/cat.jpg']);
      expect(state().messages.single.status, DeliveryStatus.sent);
    });
  });

  group('replies', () {
    test('replying sends the parent id and keeps the quote on the sent message', () async {
      service.history = [msg('42', 'Where is the PDF?', sender: 'bob')];
      await open();

      controller().startReply(state().messages.single);
      expect(state().replyingTo?.id, '42');

      await controller().send('Here it is');
      final sent = state().messages.last;
      expect(service.replies.single?.messageId, '42');
      expect(sent.replyTo?.senderName, 'bob');
      expect(sent.replyTo?.text, 'Where is the PDF?');
      expect(state().replyingTo, isNull, reason: 'the reply bar closes after sending');
    });

    test('cancelReply clears the target and the next message is not a reply', () async {
      service.history = [msg('42', 'hi', sender: 'bob')];
      await open();
      controller().startReply(state().messages.single);
      controller().cancelReply();
      await controller().send('plain');
      expect(service.replies.single, isNull);
    });

    test('messages that are not delivered yet cannot be replied to', () async {
      await open();
      service.sendError = Exception('offline');
      await controller().send('stuck'); // ends up failed with a local id
      controller().startReply(state().messages.single);
      expect(state().replyingTo, isNull);
    });

    test('retrying a failed reply keeps it a reply', () async {
      service.history = [msg('7', 'original', sender: 'bob')];
      await open();
      controller().startReply(state().messages.single);
      service.sendError = Exception('offline');
      await controller().send('my answer');
      final failed = state().messages.last;
      expect(failed.status, DeliveryStatus.failed);
      expect(failed.replyTo?.messageId, '7');

      service.sendError = null;
      await controller().retry(failed);
      expect(service.replies.single?.messageId, '7');
    });

    test('quoting a photo shows a readable preview', () async {
      final photo = ChatMessage(
        id: '9',
        text: '',
        senderId: 'bob',
        senderName: 'bob',
        createdAt: DateTime(2026, 1, 1),
        isMine: false,
        kind: MessageKind.image,
        attachmentUrl: 'https://example.com/a.jpg',
      );
      expect(photo.toReplyPreview().text, contains('Photo'));
    });
  });

  group('editing', () {
    test('editing my message saves the new text and marks it edited', () async {
      service.history = [msg('5', 'typo hre', mine: true)];
      await open();

      controller().startEdit(state().messages.single);
      expect(state().editing?.id, '5');

      await controller().send('typo here');
      expect(service.edits.single, (id: '5', text: 'typo here'));
      expect(state().messages.single.text, 'typo here');
      expect(state().messages.single.edited, isTrue);
      expect(state().editing, isNull);
      expect(service.sent, isEmpty, reason: 'an edit must not send a new message');
    });

    test("other people's messages cannot be edited", () async {
      service.history = [msg('5', 'hello', sender: 'bob')];
      await open();
      controller().startEdit(state().messages.single);
      expect(state().editing, isNull);
    });

    test('an unchanged edit does nothing', () async {
      service.history = [msg('5', 'same', mine: true)];
      await open();
      controller().startEdit(state().messages.single);
      await controller().send('same');
      expect(service.edits, isEmpty);
      expect(state().editing, isNull);
    });

    test('cancelEdit leaves the message alone', () async {
      service.history = [msg('5', 'keep me', mine: true)];
      await open();
      controller().startEdit(state().messages.single);
      controller().cancelEdit();
      expect(state().editing, isNull);
      expect(state().messages.single.text, 'keep me');
    });

    test('a failed edit shows a notice', () async {
      service.history = [msg('5', 'old', mine: true)];
      await open();
      service.editError = Exception('nope');
      controller().startEdit(state().messages.single);
      await controller().send('new');
      expect(state().notice, contains('edit'));
      expect(state().messages.single.text, 'old');
    });
  });

  group('deleting', () {
    test('deleting my message removes it', () async {
      service.history = [msg('5', 'oops', mine: true), msg('6', 'keep', sender: 'bob')];
      await open();
      await controller().delete(state().messages.first);
      expect(service.deleted, ['5']);
      expect(state().messages.map((m) => m.id), ['6']);
    });

    test('a failed delete keeps the message and shows a notice', () async {
      service.history = [msg('5', 'oops', mine: true)];
      await open();
      service.deleteError = Exception('nope');
      await controller().delete(state().messages.single);
      expect(state().messages, hasLength(1));
      expect(state().notice, contains('delete'));
    });

    test('a message that never reached the server is dropped locally', () async {
      await open();
      service.sendError = Exception('offline');
      await controller().send('stuck');
      await controller().delete(state().messages.single);
      expect(state().messages, isEmpty);
      expect(service.deleted, isEmpty);
    });

    test("other people's messages cannot be deleted", () async {
      service.history = [msg('5', 'theirs', sender: 'bob')];
      await open();
      await controller().delete(state().messages.single);
      expect(service.deleted, isEmpty);
      expect(state().messages, hasLength(1));
    });
  });

  group('reactions', () {
    test('tapping a reaction adds it immediately, tapping again removes it', () async {
      service.history = [msg('5', 'party', sender: 'bob')];
      await open();

      await controller().toggleReaction(state().messages.single, '\u{1F44D}');
      expect(service.reactions.last, (id: '5', key: '\u{1F44D}', on: true));
      var r = state().messages.single.reactions.single;
      expect(r.count, 1);
      expect(r.reactedBy('alice'), isTrue);

      await controller().toggleReaction(state().messages.single, '\u{1F44D}');
      expect(service.reactions.last.on, isFalse);
      expect(state().messages.single.reactions, isEmpty);
    });

    test('my reaction joins other people\'s on the same emoji', () async {
      service.history = [
        msg('5', 'party', sender: 'bob', reactions: const [
          ChatReaction(key: '\u{1F44D}', userIds: ['bob', 'carol']),
        ]),
      ];
      await open();
      await controller().toggleReaction(state().messages.single, '\u{1F44D}');
      expect(state().messages.single.reactions.single.count, 3);
    });

    test('a failed reaction is rolled back with a notice', () async {
      service.history = [msg('5', 'party', sender: 'bob')];
      await open();
      service.reactionError = Exception('nope');
      await controller().toggleReaction(state().messages.single, '\u{1F44D}');
      expect(state().messages.single.reactions, isEmpty);
      expect(state().notice, contains('reaction'));
    });

    test('reactions from other people arrive live', () async {
      service.history = [msg('5', 'party', mine: true)];
      await open();
      service.emit(const ReactionChanged(demoUrl, messageId: '5', key: '❤️', userId: 'bob', added: true));
      await pump();
      expect(state().messages.single.reactions.single.key, '❤️');

      service.emit(const ReactionChanged(demoUrl, messageId: '5', key: '❤️', userId: 'bob', added: false));
      await pump();
      expect(state().messages.single.reactions, isEmpty);
    });
  });

  group('live events', () {
    test('incoming messages are appended once, even if repeated, and marked read', () async {
      await open();
      service.readMarks.clear();
      final hello = msg('10', 'hello', at: DateTime(2026, 1, 1, 13));
      service.emit(MessageReceived(demoUrl, hello));
      service.emit(MessageReceived(demoUrl, hello));
      await pump();

      expect(state().messages.where((m) => m.id == '10'), hasLength(1));
      expect(service.readMarks, isNotEmpty);
    });

    test('events for other conversations are ignored', () async {
      await open();
      service.emit(MessageReceived('someone-else', msg('10', 'not for here')));
      service.emit(const TypingChanged('someone-else', ['zed']));
      await pump();
      expect(state().messages, isEmpty);
      expect(state().typingNames, isEmpty);
    });

    test('an edited message is updated in place', () async {
      service.history = [msg('5', 'before', sender: 'bob')];
      await open();
      service.emit(MessageUpdated(demoUrl, msg('5', 'after', sender: 'bob').copyWith(edited: true)));
      await pump();
      expect(state().messages.single.text, 'after');
      expect(state().messages.single.edited, isTrue);
    });

    test('a deleted message disappears', () async {
      service.history = [msg('5', 'bye', sender: 'bob')];
      await open();
      service.emit(const MessageDeleted(demoUrl, '5'));
      await pump();
      expect(state().messages, isEmpty);
    });

    test('typing indicator follows the server', () async {
      await open();
      service.emit(const TypingChanged(demoUrl, ['bob']));
      await pump();
      expect(state().typingNames, ['bob']);
      service.emit(const TypingChanged(demoUrl, []));
      await pump();
      expect(state().typingNames, isEmpty);
    });

    test('read receipts turn my messages into "seen"', () async {
      service.history = [msg('5', 'read me', mine: true), msg('6', 'and me', mine: true)];
      await open();
      expect(state().messages.any((m) => m.seen), isFalse);
      service.emit(const ReadReceiptsChanged(demoUrl, {'5'}));
      await pump();
      expect(state().messages.firstWhere((m) => m.id == '5').seen, isTrue);
      expect(state().messages.firstWhere((m) => m.id == '6').seen, isFalse);
    });
  });

  group('history paging', () {
    List<ChatMessage> many(int n) => [
          for (var i = 1; i <= n; i++)
            msg('$i', 'm$i', at: DateTime(2026, 1, 1).add(Duration(minutes: i)), sender: 'bob'),
        ];

    test('a full first page means there is more; loadOlder fetches the rest in order', () async {
      service.history = many(35);
      await open();
      expect(state().messages, hasLength(ConversationController.pageSize));
      expect(state().hasMore, isTrue);
      expect(state().messages.first.text, 'm6');

      await controller().loadOlder();
      expect(state().messages, hasLength(35));
      expect(state().messages.map((m) => m.text).first, 'm1');
      expect(state().messages.last.text, 'm35');
      expect(state().hasMore, isFalse);
    });

    test('a short first page means there is nothing older', () async {
      service.history = many(5);
      await open();
      expect(state().hasMore, isFalse);
      await controller().loadOlder(); // no-op
      expect(state().messages, hasLength(5));
    });
  });

  group('typing', () {
    test('typing is announced once, and stopped after a pause', () {
      fakeAsync((async) {
        service.history = [];
        controller().open(chan());
        async.flushMicrotasks();
        expect(state().phase, ChatPhase.ready);

        controller().onTextChanged('h');
        controller().onTextChanged('he');
        controller().onTextChanged('hel');
        expect(service.typingCalls, [true]);

        async.elapse(ConversationController.typingTimeout + const Duration(milliseconds: 100));
        expect(service.typingCalls, [true, false]);
      });
    });

    test('clearing the text or sending stops typing straight away', () async {
      await open();
      controller().onTextChanged('hey');
      expect(service.typingCalls, [true]);
      controller().onTextChanged('');
      expect(service.typingCalls, [true, false]);

      controller().onTextChanged('again');
      await controller().send('again');
      expect(service.typingCalls, [true, false, true, false]);
    });
  });
}
