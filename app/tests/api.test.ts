import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ApiClient, errorText } from '../src/services/api';

// FakeBackend uses jest.fn only in install(); these tests pass fetch in directly.
import { FakeBackend } from './fakeBackend';

function setup(token: string | null = null) {
  const be = new FakeBackend();
  let unauthorized = 0;
  const state = { token };
  const api = new ApiClient({
    baseUrl: () => '192.168.1.20:8000/',
    token: () => state.token,
    onUnauthorized: () => unauthorized++,
    fetchImpl: be.fetch as unknown as typeof fetch,
  });
  return { be, api, state, unauthorized: () => unauthorized };
}

test('login returns the token and maps the user; the base url is normalized', async () => {
  const { be, api } = setup();
  const r = await api.login('alice', 'Alice A');
  assert.deepEqual(r, { token: 'tok-alice-user', user: { userId: 'alice', displayName: 'Alice A', role: 'user' } });
  assert.equal(be.calls[0].path, '/auth/login');
  assert.equal(be.calls[0].auth, null);
});

test('a correct admin key makes an admin, a wrong one is explained', async () => {
  const { api } = setup();
  assert.equal((await api.login('boss', '', 'letmein')).user.role, 'admin');
  await assert.rejects(api.login('boss', '', 'nope'), /Wrong admin key \(403\)/);
});

test('requests carry the bearer token', async () => {
  const { be, api, state } = setup('tok-alice-user');
  state.token = 'tok-alice-user';
  await api.listAnnouncements();
  assert.equal(be.calls[0].auth, 'Bearer tok-alice-user');
});

test('a 401 signs the user out via onUnauthorized and still throws', async () => {
  const { api, unauthorized } = setup(null);
  await assert.rejects(api.listMeetings(), /Not authenticated \(401\)/);
  assert.equal(unauthorized(), 1);
});

test('a failed login is not treated as an expired session', async () => {
  const { be, api, unauthorized } = setup(null);
  be.failNext.set('/auth/login', 401);
  await assert.rejects(api.login('alice', ''));
  assert.equal(unauthorized(), 0);
});

test('announcements and meetings are mapped to camelCase', async () => {
  const { be, api, state } = setup('tok-alice-user');
  state.token = 'tok-alice-user';
  be.seedAnnouncement({ title: 'Hello', body: 'World', pinned: true, id: 50 });
  be.seedMeeting({ title: 'Class', number: '81234567890', passcode: null });
  const [a] = await api.listAnnouncements();
  assert.deepEqual(a, { id: 50, title: 'Hello', body: 'World', pinned: true, authorName: 'Admin', createdAt: a.createdAt, read: false });
  const [m] = await api.listMeetings();
  assert.equal(m.meetingNumber, '81234567890');
  assert.equal(m.passcode, null);
  assert.equal(m.durationMinutes, 60);
});

test('read state and deletes round-trip; 204 answers have no body', async () => {
  const { be, api, state } = setup('tok-boss-admin');
  state.token = 'tok-boss-admin';
  const id = be.seedAnnouncement({ title: 'T' });
  await api.markAnnouncementRead(id);
  assert.equal((await api.listAnnouncements())[0].read, true);
  await api.deleteAnnouncement(id);
  assert.deepEqual(await api.listAnnouncements(), []);
});

test('creating a meeting sends snake_case fields; a validation error becomes a sentence', async () => {
  const { be, api, state } = setup('tok-boss-admin');
  state.token = 'tok-boss-admin';
  await api.createMeeting({ title: 'Maths', description: '', meetingNumber: '81234567890', passcode: 'x', startTime: '2030-01-01T10:00:00.000Z', durationMinutes: 45, assignees: ['alice'] });
  assert.deepEqual(be.calls[0].body, {
    title: 'Maths',
    description: '',
    meeting_number: '81234567890',
    passcode: 'x',
    start_time: '2030-01-01T10:00:00.000Z',
    duration_minutes: 45,
    assignees: ['alice'],
  });
  await assert.rejects(
    api.createMeeting({ title: 'Bad', description: '', meetingNumber: '12', passcode: null, startTime: '2030-01-01T10:00:00Z', durationMinutes: 45, assignees: [] }),
    /meeting_number: bad format \(422\)/,
  );
});

test('a member cannot create announcements (403 text is passed on)', async () => {
  const { api, state } = setup('tok-alice-user');
  state.token = 'tok-alice-user';
  await assert.rejects(api.createAnnouncement({ title: 'x', body: 'y', pinned: false }), /Admins only \(403\)/);
});

test('an unreachable server surfaces the network error; health() is just false', async () => {
  const { be, api } = setup();
  be.down = true;
  await assert.rejects(api.login('a', ''), /Network request failed/);
  assert.equal(await api.health(), false);
  be.down = false;
  assert.equal(await api.health(), true);
});

test('errorText understands FastAPI error shapes', () => {
  assert.equal(errorText('{"detail":"Nope"}'), 'Nope');
  assert.equal(errorText('{"detail":[{"msg":"a"},{"msg":"b"}]}'), 'a; b');
  assert.equal(errorText('plain text'), 'plain text');
});
