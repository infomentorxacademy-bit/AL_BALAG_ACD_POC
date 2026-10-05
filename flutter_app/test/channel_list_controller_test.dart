import 'package:al_balag_poc/features/chat/channel_list_controller.dart';
import 'package:al_balag_poc/features/chat/chat_models.dart';
import 'package:al_balag_poc/features/chat/chat_providers.dart';
import 'package:al_balag_poc/features/chat/chat_service.dart';
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

  ChannelListController controller() => container.read(channelListControllerProvider.notifier);
  ChannelListState state() => container.read(channelListControllerProvider);
  Future<void> start() => controller().start(userId: 'alice', nickname: 'Alice');

  test('start joins the demo room and loads channels, newest activity first', () async {
    service.channels = [
      chan(url: 'old', title: 'Old', at: DateTime(2026, 1, 1)),
      chan(url: 'new', title: 'New', at: DateTime(2026, 1, 5)),
    ];
    await start();

    expect(state().phase, ChatPhase.ready);
    expect(service.joinedDemo, isTrue);
    expect(state().channels.map((c) => c.title), ['New', 'Old']);
  });

  test('start failure surfaces an error and can be retried', () async {
    service.connectError = Exception('boom');
    await start();
    expect(state().phase, ChatPhase.error);
    expect(state().error, contains('boom'));

    service.connectError = null;
    await start();
    expect(state().phase, ChatPhase.ready);
    expect(state().error, isNull);
  });

  test('connection changes are reflected in state', () async {
    await start();
    service.connection.add(ChatConnection.reconnecting);
    await Future<void>.delayed(Duration.zero);
    expect(state().connection, ChatConnection.reconnecting);
  });

  test('a changed channel is updated in place and moves to the top', () async {
    service.channels = [
      chan(url: 'a', title: 'A', at: DateTime(2026, 1, 3)),
      chan(url: 'b', title: 'B', at: DateTime(2026, 1, 1)),
    ];
    await start();

    service.emit(ChannelChanged(chan(url: 'b', title: 'B', lastMessage: 'hi', at: DateTime(2026, 1, 9), unread: 2)));
    await Future<void>.delayed(Duration.zero);

    expect(state().channels.map((c) => c.url), ['b', 'a']);
    expect(state().channels.first.unreadCount, 2);
    expect(state().totalUnread, 2);
  });

  test('a brand new channel (someone started a chat with me) appears', () async {
    await start();
    service.emit(ChannelChanged(chan(url: 'dm', title: 'Carol', direct: true, at: DateTime(2026, 2, 1))));
    await Future<void>.delayed(Duration.zero);
    expect(state().channels.map((c) => c.title), contains('Carol'));
  });

  test('a removed channel disappears', () async {
    service.channels = [chan(url: 'a', title: 'A'), chan(url: 'b', title: 'B')];
    await start();
    service.emit(const ChannelRemoved('a'));
    await Future<void>.delayed(Duration.zero);
    expect(state().channels.map((c) => c.url), ['b']);
  });

  test('createChannel returns the channel and adds it to the list', () async {
    await start();
    final channel = await controller().createChannel(userIds: ['bob']);
    expect(service.created.single.ids, ['bob']);
    expect(state().channels.map((c) => c.url), contains(channel.url));
  });

  test('createChannel failures are thrown to the caller', () async {
    await start();
    service.createError = Exception('user not found');
    await expectLater(controller().createChannel(userIds: ['nobody']), throwsException);
  });

  test('leave removes the channel', () async {
    service.channels = [chan(url: 'a', title: 'A')];
    await start();
    await controller().leave('a');
    expect(service.left, ['a']);
    expect(state().channels, isEmpty);
  });

  test('clearUnread zeroes one badge', () async {
    service.channels = [chan(url: 'a', title: 'A', unread: 3), chan(url: 'b', title: 'B', unread: 1)];
    await start();
    controller().clearUnread('a');
    expect(state().channels.firstWhere((c) => c.url == 'a').unreadCount, 0);
    expect(state().totalUnread, 1);
  });

  test('refresh keeps the list when it fails', () async {
    await start();
    service.loadChannelsError = Exception('offline');
    await controller().refresh();
    expect(state().channels, isNotEmpty);
    expect(state().error, contains('offline'));
  });

  test('stop resets state and disconnects', () async {
    await start();
    await controller().stop();
    expect(state().phase, ChatPhase.idle);
    expect(service.disconnected, isTrue);
  });
}
