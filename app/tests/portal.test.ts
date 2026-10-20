import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { PortalController } from '../src/portal/portalController';
import { ApiClient } from '../src/services/api';
import { FakeBackend } from './fakeBackend';

const live: PortalController[] = [];
afterEach(() => live.splice(0).forEach((p) => p.stop()));

function setup(role: 'admin' | 'user' = 'user', pollMs = 1_000_000) {
  const be = new FakeBackend();
  const token = `tok-${role === 'admin' ? 'boss' : 'alice'}-${role}`;
  be.users.set(role === 'admin' ? 'boss' : 'alice', { display_name: 'Me', role });
  const api = new ApiClient({ baseUrl: () => 'http://x', token: () => token, fetchImpl: be.fetch as unknown as typeof fetch });
  const portal = new PortalController(api, pollMs);
  live.push(portal);
  return { be, api, portal };
}

const settle = () => new Promise((r) => setTimeout(r, 10));

test('start loads announcements and meetings and stops showing the spinner', async () => {
  const { be, portal } = setup();
  be.seedAnnouncement({ title: 'A' });
  be.seedMeeting({ title: 'M' });
  assert.equal(portal.state.loading, true);
  await portal.refresh();
  assert.equal(portal.state.loading, false);
  assert.equal(portal.state.announcements.length, 1);
  assert.equal(portal.state.meetings.length, 1);
  assert.equal(portal.unreadAnnouncements, 1);
});

test('no banner for what was already there at the first load, one for what arrives later', async () => {
  const { be, portal } = setup();
  be.seedAnnouncement({ title: 'Old' });
  await portal.refresh();
  assert.equal(portal.state.toast, undefined);

  be.seedAnnouncement({ title: 'Fresh' });
  await portal.refresh();
  assert.equal((portal.state.toast as { title: string } | undefined)?.title, 'Fresh');

  portal.dismissToast();
  await portal.refresh(); // nothing new: the banner does not come back
  assert.equal(portal.state.toast, undefined);
});

test('an announcement I already read elsewhere does not pop a banner', async () => {
  const { be, portal } = setup();
  await portal.refresh();
  const id = be.seedAnnouncement({ title: 'Read on another phone' });
  be.readBy.set(id, new Set(['alice']));
  await portal.refresh();
  assert.equal(portal.state.toast, undefined);
});

test('marking read updates at once and tells the server', async () => {
  const { be, portal } = setup();
  const id = be.seedAnnouncement({ title: 'A' });
  await portal.refresh();
  const p = portal.markRead(id);
  assert.equal(portal.unreadAnnouncements, 0); // instant
  await p;
  assert.ok(be.calls.some((c) => c.path === `/announcements/${id}/read`));
});

test('marking read is undone when the server refuses', async () => {
  const { be, portal } = setup();
  const id = be.seedAnnouncement({ title: 'A' });
  await portal.refresh();
  be.failNext.set(`/announcements/${id}/read`, 500);
  await portal.markRead(id);
  assert.equal(portal.unreadAnnouncements, 1);
});

test('mark all read', async () => {
  const { be, portal } = setup();
  be.seedAnnouncement({ title: 'A' });
  be.seedAnnouncement({ title: 'B' });
  await portal.refresh();
  await portal.markAllRead();
  assert.equal(portal.unreadAnnouncements, 0);
  await portal.refresh();
  assert.equal(portal.unreadAnnouncements, 0); // the server agrees
});

test('a failed refresh keeps what was shown and reports the problem; the next one recovers', async () => {
  const { be, portal } = setup();
  be.seedAnnouncement({ title: 'A' });
  await portal.refresh();
  be.down = true;
  await portal.refresh();
  assert.equal(portal.state.announcements.length, 1);
  assert.match(portal.state.error ?? '', /Network request failed/);
  be.down = false;
  await portal.refresh();
  assert.equal(portal.state.error, undefined);
});

test('a first load that fails stops the spinner so the screen can show the error', async () => {
  const { be, portal } = setup();
  be.down = true;
  await portal.refresh();
  assert.equal(portal.state.loading, false);
  assert.ok(portal.state.error);
});

test('an answer that arrives after stop() (sign-out) is ignored', async () => {
  const { be, portal } = setup();
  be.seedAnnouncement({ title: 'A' });
  const pending = portal.refresh();
  portal.stop();
  await pending;
  assert.deepEqual(portal.state.announcements, []);
  assert.equal(portal.state.loading, true); // back to the initial state
});

test('start() polls on a timer', async () => {
  const { be, portal } = setup('user', 15);
  portal.start();
  await settle();
  be.seedAnnouncement({ title: 'Later' });
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(portal.state.announcements.length, 1);
  assert.equal(portal.state.toast?.title, 'Later');
});

test('an admin who posts does not get a banner for their own announcement', async () => {
  const { portal } = setup('admin');
  await portal.refresh();
  await portal.createAnnouncement({ title: 'Mine', body: 'b', pinned: false });
  assert.equal(portal.state.announcements[0].title, 'Mine');
  assert.equal(portal.state.toast, undefined);
});

test('admin can delete announcements and schedule or delete meetings', async () => {
  const { portal } = setup('admin');
  await portal.refresh();
  await portal.createAnnouncement({ title: 'Temp', body: 'b', pinned: false });
  const id = portal.state.announcements[0].id;
  await portal.deleteAnnouncement(id);
  assert.equal(portal.state.announcements.length, 0);

  await portal.createMeeting({ title: 'Class', description: '', meetingNumber: '81234567890', passcode: null, startTime: new Date(Date.now() + 3600000).toISOString(), durationMinutes: 60, assignees: [] });
  assert.equal(portal.state.meetings.length, 1);
  await portal.deleteMeeting(portal.state.meetings[0].id);
  assert.equal(portal.state.meetings.length, 0);
});

test('a member only sees meetings meant for them', async () => {
  const { be, portal } = setup('user');
  be.seedMeeting({ title: 'Everyone' });
  be.seedMeeting({ title: 'Just bob', assignees: ['bob'] });
  be.seedMeeting({ title: 'Alice', assignees: ['alice'] });
  await portal.refresh();
  assert.deepEqual(portal.state.meetings.map((m) => m.title).sort(), ['Alice', 'Everyone']);
});

test('a member creating an announcement gets the server refusal', async () => {
  const { portal } = setup('user');
  await assert.rejects(portal.createAnnouncement({ title: 'x', body: 'y', pinned: false }), /Admins only/);
});
