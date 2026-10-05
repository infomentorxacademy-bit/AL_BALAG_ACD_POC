import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { parseUserIds } from '../src/chat/parse';
import { canDelete, canEdit, canReplyTo, newMessage, previewText, reactedBy } from '../src/chat/types';
import { msg } from './fakes';

describe('parseUserIds', () => {
  test('splits on commas and spaces, trims and removes duplicates', () => {
    assert.deepEqual(parseUserIds('bob, carol  dave,,bob'), ['bob', 'carol', 'dave']);
  });
  test('drops my own id', () => {
    assert.deepEqual(parseUserIds('alice, bob', 'alice'), ['bob']);
  });
  test('empty input gives nothing', () => {
    assert.deepEqual(parseUserIds('  , '), []);
  });
});

describe('ChatMessage', () => {
  test('only delivered messages can be replied to, reacted to or edited', () => {
    const delivered = msg('12', 'hi', { mine: true });
    assert.ok(canReplyTo(delivered) && canEdit(delivered) && canDelete(delivered));
    const pending = { ...delivered, id: 'local-1', status: 'sending' as const };
    assert.ok(!canReplyTo(pending) && !canEdit(pending) && !canDelete(pending));
  });

  test("other people's messages cannot be edited or deleted", () => {
    const theirs = msg('12', 'hi');
    assert.ok(!canEdit(theirs) && !canDelete(theirs) && canReplyTo(theirs));
  });

  test('photos are previewed as text in quotes and lists', () => {
    const photo = newMessage({ id: '1', text: '', kind: 'image' });
    assert.match(previewText(photo), /Photo/);
    assert.ok(!canEdit({ ...photo, isMine: true }));
  });
});

test('reactedBy knows who reacted', () => {
  const r = { key: '\u{1F44D}', userIds: ['a', 'b'] };
  assert.ok(reactedBy(r, 'a'));
  assert.ok(!reactedBy(r, 'z'));
  assert.ok(!reactedBy(r, null));
});
