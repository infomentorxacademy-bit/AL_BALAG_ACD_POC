import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { ChannelListController } from '../src/chat/channelListController';
import { ConversationController, PAGE_SIZE } from '../src/chat/conversationController';
import type { PickedImage } from '../src/chat/conversationController';
import { chan, DEMO, FakeChatService, msg, tick } from './fakes';

describe('ConversationController', () => {
  let service: FakeChatService;
  let list: ChannelListController;
  let c: ConversationController;
  let picked: PickedImage | null;
  let pickerError: Error | undefined;

  const open = () => c.open(chan());

  beforeEach(() => {
    service = new FakeChatService();
    list = new ChannelListController(service);
    picked = { uri: 'file:///photos/cat.jpg', name: 'cat.jpg', type: 'image/jpeg', size: 1234 };
    pickerError = undefined;
    c = new ConversationController(
      service,
      list,
      async () => {
        if (pickerError) throw pickerError;
        return picked;
      },
      30, // typing timeout (ms), short for tests
    );
  });

  test('open loads history oldest first, becomes ready and marks the chat read', async () => {
    service.history = [
      msg('2', 'second', { at: Date.UTC(2026, 0, 1, 12, 5) }),
      msg('1', 'first', { at: Date.UTC(2026, 0, 1, 12, 0) }),
    ];
    await open();
    assert.equal(c.state.phase, 'ready');
    assert.deepEqual(c.state.messages.map((m) => m.text), ['first', 'second']);
    assert.deepEqual(service.readMarks, [DEMO]);
  });

  test('open failure surfaces an error and can be retried', async () => {
    service.loadMessagesError = new Error('boom');
    await open();
    assert.equal(c.state.phase, 'error');
    assert.match(c.state.error ?? '', /boom/);
    service.loadMessagesError = undefined;
    await open();
    assert.equal(c.state.phase, 'ready');
    assert.equal(c.state.error, undefined);
  });

  test('opening a chat clears its unread badge in the list', async () => {
    service.channels = [chan({ unreadCount: 4 })];
    await list.start('alice', 'A');
    assert.equal(list.totalUnread, 4);
    await open();
    assert.equal(list.totalUnread, 0);
  });

  test('close resets the state', async () => {
    await open();
    c.close();
    assert.equal(c.state.phase, 'idle');
    assert.equal(c.state.channel, undefined);
  });

  describe('sending', () => {
    test('send shows the message and ends as sent with the server id', async () => {
      await open();
      await c.send('  hi there  ');
      assert.deepEqual(service.sent, ['hi there']);
      assert.equal(c.state.messages.length, 1);
      assert.equal(c.state.messages[0].status, 'sent');
      assert.match(c.state.messages[0].id, /^\d+$/);
    });

    test('blank messages are ignored', async () => {
      await open();
      await c.send('   ');
      assert.equal(c.state.messages.length, 0);
      assert.equal(service.sent.length, 0);
    });

    test('failed send is marked failed and retry delivers it', async () => {
      await open();
      service.sendError = new Error('offline');
      await c.send('hello');
      assert.equal(c.state.messages[0].status, 'failed');
      service.sendError = undefined;
      await c.retry(c.state.messages[0]);
      assert.equal(c.state.messages[0].status, 'sent');
      assert.deepEqual(service.sent, ['hello']);
    });

    test('sending a photo uploads it and ends as an image message', async () => {
      await open();
      await c.sendImage();
      assert.deepEqual(service.images, ['file:///photos/cat.jpg']);
      const m = c.state.messages[0];
      assert.equal(m.kind, 'image');
      assert.equal(m.status, 'sent');
      assert.ok(m.attachmentUrl);
    });

    test('cancelling the gallery sends nothing', async () => {
      await open();
      picked = null;
      await c.sendImage();
      assert.equal(c.state.messages.length, 0);
    });

    test('a gallery error shows a notice', async () => {
      await open();
      pickerError = new Error('no permission');
      await c.sendImage();
      assert.match(c.state.notice ?? '', /gallery/);
    });

    test('a failed photo can be retried', async () => {
      await open();
      service.sendError = new Error('offline');
      await c.sendImage();
      assert.equal(c.state.messages[0].status, 'failed');
      service.sendError = undefined;
      await c.retry(c.state.messages[0]);
      assert.deepEqual(service.images, ['file:///photos/cat.jpg']);
      assert.equal(c.state.messages[0].status, 'sent');
    });
  });

  describe('replies', () => {
    test('replying sends the parent id and keeps the quote on the sent message', async () => {
      service.history = [msg('42', 'Where is the PDF?')];
      await open();
      c.startReply(c.state.messages[0]);
      assert.equal(c.state.replyingTo?.id, '42');
      await c.send('Here it is');
      const sent = c.state.messages[c.state.messages.length - 1];
      assert.equal(service.replies[0]?.messageId, '42');
      assert.equal(sent.replyTo?.senderName, 'bob');
      assert.equal(sent.replyTo?.text, 'Where is the PDF?');
      assert.equal(c.state.replyingTo, undefined, 'the reply bar closes after sending');
    });

    test('cancelReply clears the target and the next message is not a reply', async () => {
      service.history = [msg('42', 'hi')];
      await open();
      c.startReply(c.state.messages[0]);
      c.cancelReply();
      await c.send('plain');
      assert.equal(service.replies[0], undefined);
    });

    test('messages that are not delivered yet cannot be replied to', async () => {
      await open();
      service.sendError = new Error('offline');
      await c.send('stuck');
      c.startReply(c.state.messages[0]);
      assert.equal(c.state.replyingTo, undefined);
    });

    test('retrying a failed reply keeps it a reply', async () => {
      service.history = [msg('7', 'original')];
      await open();
      c.startReply(c.state.messages[0]);
      service.sendError = new Error('offline');
      await c.send('my answer');
      const failed = c.state.messages[c.state.messages.length - 1];
      assert.equal(failed.status, 'failed');
      assert.equal(failed.replyTo?.messageId, '7');
      service.sendError = undefined;
      await c.retry(failed);
      assert.equal(service.replies[0]?.messageId, '7');
    });
  });

  describe('editing', () => {
    test('editing my message saves the new text and marks it edited', async () => {
      service.history = [msg('5', 'typo hre', { mine: true })];
      await open();
      c.startEdit(c.state.messages[0]);
      assert.equal(c.state.editing?.id, '5');
      await c.send('typo here');
      assert.deepEqual(service.edits[0], { id: '5', text: 'typo here' });
      assert.equal(c.state.messages[0].text, 'typo here');
      assert.equal(c.state.messages[0].edited, true);
      assert.equal(c.state.editing, undefined);
      assert.equal(service.sent.length, 0, 'an edit must not send a new message');
    });

    test("other people's messages cannot be edited", async () => {
      service.history = [msg('5', 'hello')];
      await open();
      c.startEdit(c.state.messages[0]);
      assert.equal(c.state.editing, undefined);
    });

    test('an unchanged edit does nothing', async () => {
      service.history = [msg('5', 'same', { mine: true })];
      await open();
      c.startEdit(c.state.messages[0]);
      await c.send('same');
      assert.equal(service.edits.length, 0);
      assert.equal(c.state.editing, undefined);
    });

    test('cancelEdit leaves the message alone', async () => {
      service.history = [msg('5', 'keep me', { mine: true })];
      await open();
      c.startEdit(c.state.messages[0]);
      c.cancelEdit();
      assert.equal(c.state.editing, undefined);
      assert.equal(c.state.messages[0].text, 'keep me');
    });

    test('a failed edit shows a notice', async () => {
      service.history = [msg('5', 'old', { mine: true })];
      await open();
      service.editError = new Error('nope');
      c.startEdit(c.state.messages[0]);
      await c.send('new');
      assert.match(c.state.notice ?? '', /edit/);
      assert.equal(c.state.messages[0].text, 'old');
    });
  });

  describe('deleting', () => {
    test('deleting my message removes it', async () => {
      service.history = [msg('5', 'oops', { mine: true, at: 1 }), msg('6', 'keep', { at: 2 })];
      await open();
      await c.delete(c.state.messages[0]);
      assert.deepEqual(service.deleted, ['5']);
      assert.deepEqual(c.state.messages.map((m) => m.id), ['6']);
    });

    test('a failed delete keeps the message and shows a notice', async () => {
      service.history = [msg('5', 'oops', { mine: true })];
      await open();
      service.deleteError = new Error('nope');
      await c.delete(c.state.messages[0]);
      assert.equal(c.state.messages.length, 1);
      assert.match(c.state.notice ?? '', /delete/);
    });

    test('a message that never reached the server is dropped locally', async () => {
      await open();
      service.sendError = new Error('offline');
      await c.send('stuck');
      await c.delete(c.state.messages[0]);
      assert.equal(c.state.messages.length, 0);
      assert.equal(service.deleted.length, 0);
    });

    test("other people's messages cannot be deleted", async () => {
      service.history = [msg('5', 'theirs')];
      await open();
      await c.delete(c.state.messages[0]);
      assert.equal(service.deleted.length, 0);
      assert.equal(c.state.messages.length, 1);
    });
  });

  describe('reactions', () => {
    const thumb = '\u{1F44D}';

    test('tapping a reaction adds it immediately, tapping again removes it', async () => {
      service.history = [msg('5', 'party')];
      await open();
      await c.toggleReaction(c.state.messages[0], thumb);
      assert.deepEqual(service.reactions[service.reactions.length - 1], { id: '5', key: thumb, on: true });
      const r = c.state.messages[0].reactions[0];
      assert.equal(r.userIds.length, 1);
      assert.ok(r.userIds.includes('alice'));

      await c.toggleReaction(c.state.messages[0], thumb);
      assert.equal(service.reactions[service.reactions.length - 1].on, false);
      assert.equal(c.state.messages[0].reactions.length, 0);
    });

    test("my reaction joins other people's on the same emoji", async () => {
      service.history = [msg('5', 'party', { reactions: [{ key: thumb, userIds: ['bob', 'carol'] }] })];
      await open();
      await c.toggleReaction(c.state.messages[0], thumb);
      assert.equal(c.state.messages[0].reactions[0].userIds.length, 3);
    });

    test('a failed reaction is rolled back with a notice', async () => {
      service.history = [msg('5', 'party')];
      await open();
      service.reactionError = new Error('nope');
      await c.toggleReaction(c.state.messages[0], thumb);
      assert.equal(c.state.messages[0].reactions.length, 0);
      assert.match(c.state.notice ?? '', /reaction/);
    });

    test('reactions from other people arrive live', async () => {
      service.history = [msg('5', 'party', { mine: true })];
      await open();
      service.emit({ type: 'reactionChanged', channelUrl: DEMO, messageId: '5', key: '❤️', userId: 'bob', added: true });
      assert.equal(c.state.messages[0].reactions[0].key, '❤️');
      service.emit({ type: 'reactionChanged', channelUrl: DEMO, messageId: '5', key: '❤️', userId: 'bob', added: false });
      assert.equal(c.state.messages[0].reactions.length, 0);
    });
  });

  describe('live events', () => {
    test('incoming messages are appended once, even if repeated, and marked read', async () => {
      await open();
      service.readMarks = [];
      const hello = msg('10', 'hello', { at: Date.UTC(2026, 0, 1, 13) });
      service.emit({ type: 'messageReceived', channelUrl: DEMO, message: hello });
      service.emit({ type: 'messageReceived', channelUrl: DEMO, message: hello });
      assert.equal(c.state.messages.filter((m) => m.id === '10').length, 1);
      assert.ok(service.readMarks.length > 0);
    });

    test('events for other conversations are ignored', async () => {
      await open();
      service.emit({ type: 'messageReceived', channelUrl: 'someone-else', message: msg('10', 'not for here') });
      service.emit({ type: 'typingChanged', channelUrl: 'someone-else', names: ['zed'] });
      assert.equal(c.state.messages.length, 0);
      assert.equal(c.state.typingNames.length, 0);
    });

    test('an edited message is updated in place', async () => {
      service.history = [msg('5', 'before')];
      await open();
      service.emit({ type: 'messageUpdated', channelUrl: DEMO, message: { ...msg('5', 'after'), edited: true } });
      assert.equal(c.state.messages[0].text, 'after');
      assert.equal(c.state.messages[0].edited, true);
    });

    test('a deleted message disappears', async () => {
      service.history = [msg('5', 'bye')];
      await open();
      service.emit({ type: 'messageDeleted', channelUrl: DEMO, messageId: '5' });
      assert.equal(c.state.messages.length, 0);
    });

    test('typing indicator follows the server', async () => {
      await open();
      service.emit({ type: 'typingChanged', channelUrl: DEMO, names: ['bob'] });
      assert.deepEqual(c.state.typingNames, ['bob']);
      service.emit({ type: 'typingChanged', channelUrl: DEMO, names: [] });
      assert.deepEqual(c.state.typingNames, []);
    });

    test('read receipts turn my messages into "seen"', async () => {
      service.history = [msg('5', 'read me', { mine: true, at: 1 }), msg('6', 'and me', { mine: true, at: 2 })];
      await open();
      assert.ok(!c.state.messages.some((m) => m.seen));
      service.emit({ type: 'readReceiptsChanged', channelUrl: DEMO, seenMessageIds: ['5'] });
      assert.equal(c.state.messages.find((m) => m.id === '5')?.seen, true);
      assert.equal(c.state.messages.find((m) => m.id === '6')?.seen, false);
    });
  });

  describe('history paging', () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => msg(String(i + 1), `m${i + 1}`, { at: Date.UTC(2026, 0, 1) + (i + 1) * 60000 }));

    test('a full first page means there is more; loadOlder fetches the rest in order', async () => {
      service.history = many(35);
      await open();
      assert.equal(c.state.messages.length, PAGE_SIZE);
      assert.equal(c.state.hasMore, true);
      assert.equal(c.state.messages[0].text, 'm6');
      await c.loadOlder();
      assert.equal(c.state.messages.length, 35);
      assert.equal(c.state.messages[0].text, 'm1');
      assert.equal(c.state.messages[34].text, 'm35');
      assert.equal(c.state.hasMore, false);
    });

    test('a short first page means there is nothing older', async () => {
      service.history = many(5);
      await open();
      assert.equal(c.state.hasMore, false);
      await c.loadOlder();
      assert.equal(c.state.messages.length, 5);
    });
  });

  describe('typing', () => {
    test('typing is announced once, and stopped after a pause', async () => {
      await open();
      c.onTextChanged('h');
      c.onTextChanged('he');
      c.onTextChanged('hel');
      assert.deepEqual(service.typingCalls, [true]);
      await tick(80);
      assert.deepEqual(service.typingCalls, [true, false]);
    });

    test('clearing the text or sending stops typing straight away', async () => {
      await open();
      c.onTextChanged('hey');
      assert.deepEqual(service.typingCalls, [true]);
      c.onTextChanged('');
      assert.deepEqual(service.typingCalls, [true, false]);
      c.onTextChanged('again');
      await c.send('again');
      assert.deepEqual(service.typingCalls, [true, false, true, false]);
    });
  });
});
