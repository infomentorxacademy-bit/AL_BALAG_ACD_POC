import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { formatDay, formatListTime, formatTime, sameDay } from '../src/format';
import {
  addRecent,
  formatMeetingNumber,
  friendlyTokenError,
  isValidMeetingNumber,
  normalizeBaseUrl,
  validateUserId,
} from '../src/logic';

describe('validateUserId', () => {
  test('accepts a normal id', () => assert.equal(validateUserId('alice'), null));
  test('rejects empty, spaces and very long ids', () => {
    assert.equal(validateUserId('  '), 'Enter a user id');
    assert.equal(validateUserId('a b'), 'No spaces allowed');
    assert.equal(validateUserId('x'.repeat(81)), 'At most 80 characters');
  });
});

describe('meeting numbers', () => {
  test('validate 9 to 11 digits, ignoring spaces', () => {
    assert.ok(isValidMeetingNumber('812 3456 7890'));
    assert.ok(isValidMeetingNumber('123456789'));
    assert.ok(!isValidMeetingNumber('12345'));
    assert.ok(!isValidMeetingNumber('abc'));
  });
  test('format for display', () => {
    assert.equal(formatMeetingNumber('81234567890'), '812 3456 7890');
    assert.equal(formatMeetingNumber('123456789'), '123 456 789');
  });
  test('recents are newest first, unique and capped at 5', () => {
    let list: string[] = [];
    for (const n of ['1', '2', '3', '4', '5', '6']) list = addRecent(list, n);
    assert.deepEqual(list, ['6', '5', '4', '3', '2']);
    assert.deepEqual(addRecent(list, '4'), ['4', '6', '5', '3', '2']);
  });
});

describe('normalizeBaseUrl', () => {
  test('adds a scheme and trims slashes', () => {
    assert.equal(normalizeBaseUrl('192.168.1.20:8000/'), 'http://192.168.1.20:8000');
    assert.equal(normalizeBaseUrl(' https://api.example.com// '), 'https://api.example.com');
  });
});

describe('friendlyTokenError', () => {
  test('explains an unreachable server', () => {
    assert.match(friendlyTokenError(new TypeError('Network request failed'), 'http://x:8000'), /Cannot reach the server at http:\/\/x:8000/);
  });
  test('explains a server misconfiguration', () => {
    assert.match(friendlyTokenError(new Error('Signature request failed (500): no key'), 'u'), /misconfigured/);
  });
  test('passes other errors through', () => {
    assert.equal(friendlyTokenError(new Error('Nope'), 'u'), 'Nope');
  });
});

describe('date and time labels', () => {
  const noon = new Date(2026, 9, 5, 12, 0).getTime();
  test('formatTime uses a 12-hour clock', () => {
    assert.equal(formatTime(new Date(2026, 9, 5, 15, 7).getTime()), '3:07 PM');
    assert.equal(formatTime(new Date(2026, 9, 5, 0, 5).getTime()), '12:05 AM');
    assert.equal(formatTime(noon), '12:00 PM');
  });
  test('formatDay says Today and Yesterday', () => {
    assert.equal(formatDay(noon, noon), 'Today');
    assert.equal(formatDay(noon - 24 * 3600 * 1000, noon), 'Yesterday');
    assert.equal(formatDay(new Date(2026, 0, 3).getTime(), noon), 'Jan 3, 2026');
  });
  test('formatListTime is short', () => {
    assert.equal(formatListTime(noon, noon), '12:00 PM');
    assert.equal(formatListTime(noon - 24 * 3600 * 1000, noon), 'Yesterday');
    assert.equal(formatListTime(new Date(2026, 0, 3).getTime(), noon), 'Jan 3');
  });
  test('sameDay compares calendar days', () => {
    assert.ok(sameDay(noon, noon + 3600 * 1000));
    assert.ok(!sameDay(noon, noon + 24 * 3600 * 1000));
  });
});
