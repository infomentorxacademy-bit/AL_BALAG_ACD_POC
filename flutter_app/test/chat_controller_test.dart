import 'package:al_balag_poc/features/chat/chat_controller.dart';
import 'package:al_balag_poc/features/chat/chat_models.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

void main() {
  late FakeChatService service;
  late ProviderContainer container;

  setUp(() {
    service = FakeChatService();
    container = ProviderContainer(overrides: [chatServiceProvider.overrideWithValue(service)]);
    addTearDown(container.dispose);
  });

  ChatController controller() => container.read(chatControllerProvider.notifier);
  ChatState state() => container.read(chatControllerProvider);

  test('start loads history, oldest first, and becomes ready', () async {
    service.history = [
      msg('2', 'second', at: DateTime(2026, 1, 1, 12, 5)),
      msg('1', 'first', at: DateTime(2026, 1, 1, 12, 0)),
    ];
    await controller().start(userId: 'alice', nickname: 'Alice');

    expect(state().phase, ChatPhase.ready);
    expect(state().messages.map((m) => m.text), ['first', 'second']);
  });

  test('start failure surfaces an error and can be retried', () async {
    service.connectError = Exception('boom');
    await controller().start(userId: 'alice', nickname: 'Alice');
    expect(state().phase, ChatPhase.error);
    expect(state().error, contains('boom'));

    service.connectError = null;
    await controller().start(userId: 'alice', nickname: 'Alice');
    expect(state().phase, ChatPhase.ready);
    expect(state().error, isNull);
  });

  test('incoming messages are appended once, even if repeated', () async {
    await controller().start(userId: 'alice', nickname: 'Alice');
    final hello = msg('10', 'hello', at: DateTime(2026, 1, 1, 13));
    service.incoming.add(hello);
    service.incoming.add(hello);
    await Future<void>.delayed(Duration.zero);

    expect(state().messages.where((m) => m.id == '10'), hasLength(1));
  });

  test('send shows the message and ends as sent with the server id', () async {
    await controller().start(userId: 'alice', nickname: 'Alice');
    await controller().send('  hi there  ');

    expect(service.sent, ['hi there']);
    final mine = state().messages.single;
    expect(mine.status, DeliveryStatus.sent);
    expect(mine.id, 'srv-1');
  });

  test('blank messages are ignored', () async {
    await controller().start(userId: 'alice', nickname: 'Alice');
    await controller().send('   ');
    expect(state().messages, isEmpty);
    expect(service.sent, isEmpty);
  });

  test('failed send is marked failed and retry delivers it', () async {
    await controller().start(userId: 'alice', nickname: 'Alice');
    service.sendError = Exception('offline');
    await controller().send('hello');
    expect(state().messages.single.status, DeliveryStatus.failed);

    service.sendError = null;
    await controller().retry(state().messages.single);
    expect(state().messages.single.status, DeliveryStatus.sent);
    expect(service.sent, ['hello']);
  });

  test('connection changes are reflected in state', () async {
    await controller().start(userId: 'alice', nickname: 'Alice');
    service.connection.add(ChatConnection.reconnecting);
    await Future<void>.delayed(Duration.zero);
    expect(state().connection, ChatConnection.reconnecting);
  });

  test('stop resets state and disconnects', () async {
    await controller().start(userId: 'alice', nickname: 'Alice');
    await controller().stop();
    expect(state().phase, ChatPhase.idle);
    expect(service.disconnected, isTrue);
  });

  group('replies', () {
    test('replying sends the parent id and keeps the quote on the sent message', () async {
      service.history = [msg('42', 'Where is the PDF?', sender: 'bob')];
      await controller().start(userId: 'alice', nickname: 'Alice');

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
      await controller().start(userId: 'alice', nickname: 'Alice');
      controller().startReply(state().messages.single);
      controller().cancelReply();
      await controller().send('plain');
      expect(service.replies.single, isNull);
    });

    test('messages that are not delivered yet cannot be replied to', () async {
      await controller().start(userId: 'alice', nickname: 'Alice');
      service.sendError = Exception('offline');
      await controller().send('stuck'); // ends up failed with a local id
      controller().startReply(state().messages.single);
      expect(state().replyingTo, isNull);
    });

    test('retrying a failed reply keeps it a reply', () async {
      service.history = [msg('7', 'original', sender: 'bob')];
      await controller().start(userId: 'alice', nickname: 'Alice');
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
  });
}
