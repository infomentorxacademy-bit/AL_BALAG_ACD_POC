import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { ActiveMeetingController, isJoinSuccess } from '../src/meeting/activeMeeting';
import type { ActiveSession } from '../src/meeting/activeMeeting';
import { FakeZoomWindow as FakeZoom } from './fakes';

const session: ActiveSession = { jwtToken: 'JWT', meetingNumber: '81234567890', password: '', userName: 'Alice' };

describe('ActiveMeetingController', () => {
  let zoom: FakeZoom;
  let c: ActiveMeetingController;

  beforeEach(() => {
    zoom = new FakeZoom();
    c = new ActiveMeetingController(zoom);
  });

  test('starts idle', () => {
    assert.equal(c.state.phase, 'idle');
    assert.equal(c.isRunning, false);
  });

  test('start moves to joining and keeps the session', () => {
    c.start(session);
    assert.equal(c.state.phase, 'joining');
    assert.equal(c.state.session?.meetingNumber, '81234567890');
    assert.equal(c.isRunning, true);
  });

  test('InMeeting makes the meeting active', () => {
    c.start(session);
    zoom.emitState('InMeeting');
    assert.equal(c.state.phase, 'active');
  });

  test('an early "Idle" before we ever got in does not cancel the join', () => {
    c.start(session);
    zoom.emitState('Idle');
    assert.equal(c.state.phase, 'joining');
  });

  test('Ended after being in the meeting ends it and clears the session', () => {
    c.start(session);
    zoom.emitState('InMeeting');
    zoom.emitState('Ended');
    assert.equal(c.state.phase, 'idle');
    assert.equal(c.state.session, undefined);
    assert.equal(zoom.stateListeners.size, 0, 'listeners are removed');
  });

  test('Idle after being in the meeting also ends it', () => {
    c.start(session);
    zoom.emitState('InMeeting');
    zoom.emitState('Idle');
    assert.equal(c.state.phase, 'idle');
  });

  test('Ended while still joining (for example the host ended it) stops the attempt', () => {
    c.start(session);
    zoom.emitState('Ended');
    assert.equal(c.state.phase, 'idle');
  });

  test('iOS style state names work too', () => {
    c.start(session);
    zoom.emitState('MobileRTCMeetingState_InMeeting');
    assert.equal(c.state.phase, 'active');
    zoom.emitState('MobileRTCMeetingState_Ended');
    assert.equal(c.state.phase, 'idle');
  });

  test('minimizing keeps the meeting active', () => {
    c.start(session);
    zoom.emitMinimized();
    assert.equal(c.state.phase, 'active');
  });

  test('a failed join result stops the attempt with a readable error', () => {
    c.start(session);
    c.onJoinResult('MEETING_ERROR_INCORRECT_MEETING_NUMBER');
    assert.equal(c.state.phase, 'idle');
    assert.match(c.state.error ?? '', /MEETING_ERROR_INCORRECT_MEETING_NUMBER/);
  });

  test('a successful join result keeps waiting for InMeeting', () => {
    c.start(session);
    c.onJoinResult('MEETING_ERROR_SUCCESS');
    assert.equal(c.state.phase, 'joining');
    assert.ok(isJoinSuccess('MEETING_ERROR_SUCCESS'));
    assert.ok(!isJoinSuccess('MEETING_ERROR_TIMEOUT'));
  });

  test('returnToMeeting asks Zoom to bring the meeting back', async () => {
    c.start(session);
    zoom.emitState('InMeeting');
    await c.returnToMeeting();
    assert.equal(zoom.returned, 1);
    assert.equal(c.state.phase, 'active');
  });

  test('returnToMeeting does nothing when there is no meeting', async () => {
    await c.returnToMeeting();
    assert.equal(zoom.returned, 0);
  });

  test('if returning fails because the meeting is gone, the app cleans up', async () => {
    c.start(session);
    zoom.emitState('InMeeting');
    zoom.returnError = true;
    zoom.meetingState = 'Idle';
    await c.returnToMeeting();
    assert.equal(c.state.phase, 'idle');
  });

  test('coming back to the app catches a meeting that ended while we were away', async () => {
    c.start(session);
    zoom.emitState('InMeeting');
    zoom.meetingState = 'Ended';
    await c.syncWithZoom();
    assert.equal(c.state.phase, 'idle');
  });

  test('coming back to the app catches a missed InMeeting', async () => {
    c.start(session);
    zoom.meetingState = 'InMeeting';
    await c.syncWithZoom();
    assert.equal(c.state.phase, 'active');
  });

  test('sync does not end a meeting that has not started yet', async () => {
    c.start(session);
    zoom.meetingState = 'Idle';
    await c.syncWithZoom();
    assert.equal(c.state.phase, 'joining');
  });

  test('overlay permission: reports it, defaults to allowed if the check fails, and opens settings', async () => {
    zoom.overlay = false;
    assert.equal(await c.overlayAllowed(), false);
    zoom.overlayError = true;
    assert.equal(await c.overlayAllowed(), true);
    await c.openOverlaySettings();
    assert.equal(zoom.overlaySettingsOpened, 1);
  });

  test('starting a second meeting replaces the first cleanly', () => {
    c.start(session);
    c.start({ ...session, meetingNumber: '99999999999' });
    assert.equal(c.state.session?.meetingNumber, '99999999999');
    assert.equal(zoom.stateListeners.size, 1);
  });
});
