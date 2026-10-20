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

import {
  formatWhen,
  meetingTiming,
  parseIds,
  parseLocalDateTime,
  timeAgo,
  toDateInput,
  toTimeInput,
  validateAnnouncement,
  validateMeetingForm,
} from '../src/logic';

test('parseLocalDateTime accepts real dates and rejects impossible ones', () => {
  const d = parseLocalDateTime('2026-03-05', '9:05');
  assert.ok(d);
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()], [2026, 2, 5, 9, 5]);
  assert.equal(parseLocalDateTime('2026-02-30', '10:00'), null);
  assert.equal(parseLocalDateTime('2026-03-05', '24:00'), null);
  assert.equal(parseLocalDateTime('2026-03-05', '10:60'), null);
  assert.equal(parseLocalDateTime('05/03/2026', '10:00'), null);
  assert.equal(parseLocalDateTime('', ''), null);
});

test('date and time inputs round-trip', () => {
  const d = new Date(2026, 0, 9, 7, 3);
  assert.equal(toDateInput(d), '2026-01-09');
  assert.equal(toTimeInput(d), '07:03');
  assert.equal(parseLocalDateTime(toDateInput(d), toTimeInput(d))?.getTime(), d.getTime());
});

test('formatWhen says today, tomorrow, yesterday, then the date', () => {
  const now = new Date(2026, 2, 5, 12, 0);
  assert.equal(formatWhen(new Date(2026, 2, 5, 14, 30).toISOString(), now), 'Today, 14:30');
  assert.equal(formatWhen(new Date(2026, 2, 6, 9, 0).toISOString(), now), 'Tomorrow, 09:00');
  assert.equal(formatWhen(new Date(2026, 2, 4, 9, 0).toISOString(), now), 'Yesterday, 09:00');
  assert.equal(formatWhen(new Date(2026, 2, 9, 9, 0).toISOString(), now), 'Mon 9 Mar, 09:00');
  assert.equal(formatWhen('garbage', now), '');
});

test('timeAgo', () => {
  const now = new Date(2026, 2, 5, 12, 0);
  const ago = (min: number) => new Date(now.getTime() - min * 60000).toISOString();
  assert.equal(timeAgo(ago(0), now), 'just now');
  assert.equal(timeAgo(ago(5), now), '5 min ago');
  assert.equal(timeAgo(ago(180), now), '3 h ago');
  assert.equal(timeAgo(ago(60 * 24 * 2), now), '2 d ago');
  assert.equal(timeAgo(ago(60 * 24 * 30), now), '3 Feb');
});

test('meetingTiming: joining opens 10 minutes early and closes when the meeting is over', () => {
  const now = new Date(2026, 2, 5, 12, 0);
  const at = (min: number) => new Date(now.getTime() + min * 60000).toISOString();
  assert.equal(meetingTiming(at(5), 60, now), 'live'); // starts in 5 min
  assert.equal(meetingTiming(at(10), 60, now), 'live');
  assert.equal(meetingTiming(at(11), 60, now), 'soon');
  assert.equal(meetingTiming(at(60), 60, now), 'soon');
  assert.equal(meetingTiming(at(61), 60, now), 'upcoming');
  assert.equal(meetingTiming(at(-30), 60, now), 'live'); // started half an hour ago
  assert.equal(meetingTiming(at(-61), 60, now), 'past');
});

test('parseIds splits on commas, spaces and semicolons without duplicates', () => {
  assert.deepEqual(parseIds('alice, bob  carol;alice\n dave'), ['alice', 'bob', 'carol', 'dave']);
  assert.deepEqual(parseIds('  , '), []);
});

test('announcement and meeting form validation', () => {
  assert.equal(validateAnnouncement('', 'x'), 'Enter a title');
  assert.equal(validateAnnouncement('t', ' '), 'Write the announcement');
  assert.match(validateAnnouncement('t'.repeat(121), 'x') ?? '', /too long/);
  assert.equal(validateAnnouncement('Hi', 'There'), null);

  const ok = { title: 'Class', meetingNumber: '812 3456 7890', date: '2026-03-05', time: '10:00', duration: '60' };
  assert.equal(validateMeetingForm(ok), null);
  assert.equal(validateMeetingForm({ ...ok, title: ' ' }), 'Enter a title');
  assert.match(validateMeetingForm({ ...ok, meetingNumber: '123' }) ?? '', /9 to 11 digits/);
  assert.match(validateMeetingForm({ ...ok, date: '2026-13-01' }) ?? '', /YYYY-MM-DD/);
  assert.match(validateMeetingForm({ ...ok, duration: '2' }) ?? '', /5 to 1440/);
  assert.match(validateMeetingForm({ ...ok, duration: 'abc' }) ?? '', /5 to 1440/);
});
