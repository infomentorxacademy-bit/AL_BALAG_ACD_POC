import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { ChannelListController } from '../src/chat/channelListController';
import { chan, FakeChatService, tick } from './fakes';

describe('ChannelListController', () => {
  let service: FakeChatService;
  let c: ChannelListController;
  const start = () => c.start('alice', 'Alice');

  beforeEach(() => {
    service = new FakeChatService();
    c = new ChannelListController(service);
  });

  test('start joins the demo room and loads channels, newest activity first', async () => {
    service.channels = [
      chan({ url: 'old', title: 'Old', lastMessageAt: Date.UTC(2026, 0, 1) }),
      chan({ url: 'new', title: 'New', lastMessageAt: Date.UTC(2026, 0, 5) }),
    ];
    await start();
    assert.equal(c.state.phase, 'ready');
    assert.equal(service.joinedDemo, true);
    assert.deepEqual(c.state.channels.map((x) => x.title), ['New', 'Old']);
  });

  test('start failure surfaces an error and can be retried', async () => {
    service.connectError = new Error('boom');
    await start();
    assert.equal(c.state.phase, 'error');
    assert.match(c.state.error ?? '', /boom/);

    service.connectError = undefined;
    await start();
    assert.equal(c.state.phase, 'ready');
    assert.equal(c.state.error, undefined);
  });

  test('connection changes are reflected in state', async () => {
    await start();
    service.emitConnection('reconnecting');
    assert.equal(c.state.connection, 'reconnecting');
  });

  test('a changed channel is updated in place and moves to the top', async () => {
    service.channels = [
      chan({ url: 'a', title: 'A', lastMessageAt: Date.UTC(2026, 0, 3) }),
      chan({ url: 'b', title: 'B', lastMessageAt: Date.UTC(2026, 0, 1) }),
    ];
    await start();
    service.emit({
      type: 'channelChanged',
      channelUrl: 'b',
      channel: chan({ url: 'b', title: 'B', lastMessage: 'hi', lastMessageAt: Date.UTC(2026, 0, 9), unreadCount: 2 }),
    });
    assert.deepEqual(c.state.channels.map((x) => x.url), ['b', 'a']);
    assert.equal(c.state.channels[0].unreadCount, 2);
    assert.equal(c.totalUnread, 2);
  });

  test('a brand new channel (someone started a chat with me) appears', async () => {
    await start();
    service.emit({
      type: 'channelChanged',
      channelUrl: 'dm',
      channel: chan({ url: 'dm', title: 'Carol', isDirect: true, lastMessageAt: Date.UTC(2026, 1, 1) }),
    });
    assert.ok(c.state.channels.some((x) => x.title === 'Carol'));
  });

  test('a removed channel disappears', async () => {
    service.channels = [chan({ url: 'a', title: 'A' }), chan({ url: 'b', title: 'B' })];
    await start();
    service.emit({ type: 'channelRemoved', channelUrl: 'a' });
    assert.deepEqual(c.state.channels.map((x) => x.url), ['b']);
  });

  test('createChannel returns the channel and adds it to the list', async () => {
    await start();
    const channel = await c.createChannel(['bob']);
    assert.deepEqual(service.created[0].ids, ['bob']);
    assert.ok(c.state.channels.some((x) => x.url === channel.url));
  });

  test('createChannel failures are thrown to the caller', async () => {
    await start();
    service.createError = new Error('user not found');
    await assert.rejects(c.createChannel(['nobody']), /user not found/);
  });

  test('leave removes the channel', async () => {
    service.channels = [chan({ url: 'a', title: 'A' })];
    await start();
    await c.leave('a');
    assert.deepEqual(service.left, ['a']);
    assert.equal(c.state.channels.length, 0);
  });

  test('clearUnread zeroes one badge', async () => {
    service.channels = [chan({ url: 'a', unreadCount: 3 }), chan({ url: 'b', unreadCount: 1 })];
    await start();
    c.clearUnread('a');
    assert.equal(c.state.channels.find((x) => x.url === 'a')?.unreadCount, 0);
    assert.equal(c.totalUnread, 1);
  });

  test('refresh keeps the list when it fails', async () => {
    await start();
    service.loadChannelsError = new Error('offline');
    await c.refresh();
    assert.ok(c.state.channels.length > 0);
    assert.match(c.state.error ?? '', /offline/);
  });

  test('stop resets state and disconnects', async () => {
    await start();
    await c.stop();
    assert.equal(c.state.phase, 'idle');
    assert.equal(service.disconnected, true);
    await tick();
  });
});
