import 'package:fake_async/fake_async.dart';
import 'package:al_balag_poc/core/providers.dart';
import 'package:al_balag_poc/features/meeting/meeting_controller.dart';
import 'package:al_balag_poc/features/meeting/meeting_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/fakes.dart';

void main() {
  late FakeMeetingService service;
  late ProviderContainer container;

  Future<void> setUpContainer([Map<String, Object> prefsValues = const {}]) async {
    SharedPreferences.setMockInitialValues(prefsValues);
    final prefs = await SharedPreferences.getInstance();
    service = FakeMeetingService();
    container = ProviderContainer(overrides: [
      sharedPreferencesProvider.overrideWithValue(prefs),
      meetingServiceProvider.overrideWithValue(service),
    ]);
    addTearDown(container.dispose);
  }

  MeetingController controller() => container.read(meetingControllerProvider.notifier);
  MeetingState state() => container.read(meetingControllerProvider);

  test('rejects an invalid meeting number without calling Zoom', () async {
    await setUpContainer();
    await controller().join(meetingNumber: '12', displayName: 'Alice');
    expect(state().phase, MeetingPhase.error);
    expect(service.joined, isEmpty);
  });

  test('normalizes the number, passes passcode, and moves to joining', () async {
    await setUpContainer();
    await controller().join(meetingNumber: '812 3456 7890', displayName: 'Alice', passcode: 'abc');
    expect(service.joined.single.number, '81234567890');
    expect(service.joined.single.passcode, 'abc');
    expect(service.joined.single.name, 'Alice');
    expect(state().phase, MeetingPhase.joining);
  });

  test('empty passcode is sent as null', () async {
    await setUpContainer();
    await controller().join(meetingNumber: '81234567890', displayName: 'A', passcode: '');
    expect(service.joined.single.passcode, isNull);
  });

  test('status events drive the phase: InMeeting then Ended', () async {
    await setUpContainer();
    await controller().join(meetingNumber: '81234567890', displayName: 'A');
    service.updates.add(const MeetingStatusUpdate(status: 'InMeeting'));
    await Future<void>.delayed(Duration.zero);
    expect(state().phase, MeetingPhase.inMeeting);

    service.updates.add(const MeetingStatusUpdate(status: 'Ended'));
    await Future<void>.delayed(Duration.zero);
    expect(state().phase, MeetingPhase.idle);
  });

  test('a Failed status shows the friendly message', () async {
    await setUpContainer();
    await controller().join(meetingNumber: '81234567890', displayName: 'A');
    service.updates.add(const MeetingStatusUpdate(status: 'Failed', errorMessage: 'Meeting not found'));
    await Future<void>.delayed(Duration.zero);
    expect(state().phase, MeetingPhase.error);
    expect(state().error, 'Meeting not found');
  });

  test('service errors are shown and do not get remembered', () async {
    await setUpContainer();
    service.joinError = const MeetingException('Server down');
    await controller().join(meetingNumber: '81234567890', displayName: 'A');
    expect(state().phase, MeetingPhase.error);
    expect(state().error, 'Server down');
    expect(state().recent, isEmpty);
  });

  test('recent meetings are de-duplicated, newest first, capped at 5, and persisted', () async {
    await setUpContainer();
    for (final n in ['111111111', '222222222', '333333333', '444444444', '555555555', '666666666', '222222222']) {
      await controller().join(meetingNumber: n, displayName: 'A');
      service.updates.add(const MeetingStatusUpdate(status: 'Ended'));
      await Future<void>.delayed(Duration.zero);
    }
    expect(state().recent, ['222222222', '666666666', '555555555', '444444444', '333333333']);

    final prefs = container.read(sharedPreferencesProvider);
    expect(prefs.getStringList('recent_meetings'), state().recent);
  });

  test('watchdog: if Zoom never reports progress the form is released with a message', () async {
    await setUpContainer();
    fakeAsync((async) {
      controller().join(meetingNumber: '81234567890', displayName: 'A');
      async.flushMicrotasks();
      expect(state().phase, MeetingPhase.joining);

      async.elapse(joinWatchdogTimeout + const Duration(seconds: 1));
      expect(state().phase, MeetingPhase.error);
      expect(state().error, contains('did not start'));
    });
  });

  test('watchdog is cancelled once Zoom reports a status', () async {
    await setUpContainer();
    fakeAsync((async) {
      controller().join(meetingNumber: '81234567890', displayName: 'A');
      async.flushMicrotasks();
      service.updates.add(const MeetingStatusUpdate(status: 'Connecting'));
      async.flushMicrotasks();

      async.elapse(joinWatchdogTimeout * 2);
      expect(state().phase, MeetingPhase.joining);
      expect(state().error, isNull);
    });
  });

  test('recent meetings are restored from preferences', () async {
    await setUpContainer({'recent_meetings': ['123456789']});
    expect(state().recent, ['123456789']);
  });

  group('keeping the meeting reachable', () {
    Future<void> joinAndGetIn() async {
      await setUpContainer();
      await controller().join(meetingNumber: '81234567890', displayName: 'A');
      service.updates.add(const MeetingStatusUpdate(status: 'InMeeting'));
      await Future<void>.delayed(Duration.zero);
    }

    test('the meeting number is remembered while it runs and cleared when it ends', () async {
      await joinAndGetIn();
      expect(state().number, '81234567890');
      expect(state().inProgress, isTrue);
      service.updates.add(const MeetingStatusUpdate(status: 'Ended'));
      await Future<void>.delayed(Duration.zero);
      expect(state().number, isNull);
      expect(state().inProgress, isFalse);
    });

    test('an early "Idle" before we got in does not cancel the join', () async {
      await setUpContainer();
      await controller().join(meetingNumber: '81234567890', displayName: 'A');
      service.updates.add(const MeetingStatusUpdate(status: 'Idle'));
      await Future<void>.delayed(Duration.zero);
      expect(state().phase, MeetingPhase.joining);
    });

    test('"Idle" after being in the meeting ends it', () async {
      await joinAndGetIn();
      service.updates.add(const MeetingStatusUpdate(status: 'Idle'));
      await Future<void>.delayed(Duration.zero);
      expect(state().phase, MeetingPhase.idle);
    });

    test('minimizing keeps the meeting running', () async {
      await joinAndGetIn();
      service.minimizedEvents.add(null);
      await Future<void>.delayed(Duration.zero);
      expect(state().phase, MeetingPhase.inMeeting);
    });

    test('returnToMeeting asks Zoom to bring it back; it does nothing when there is no meeting', () async {
      await setUpContainer();
      await controller().returnToMeeting();
      expect(service.returned, 0);

      await controller().join(meetingNumber: '81234567890', displayName: 'A');
      service.updates.add(const MeetingStatusUpdate(status: 'InMeeting'));
      await Future<void>.delayed(Duration.zero);
      await controller().returnToMeeting();
      expect(service.returned, 1);
    });

    test('if returning fails because the meeting is gone, the app cleans up', () async {
      await joinAndGetIn();
      service
        ..returnFails = true
        ..zoomState = 'Idle';
      await controller().returnToMeeting();
      expect(state().phase, MeetingPhase.idle);
    });

    test('coming back to the app catches a meeting that ended while we were away', () async {
      await joinAndGetIn();
      service.zoomState = 'Ended';
      await controller().syncWithZoom();
      expect(state().phase, MeetingPhase.idle);
    });

    test('coming back to the app catches a missed InMeeting', () async {
      await setUpContainer();
      await controller().join(meetingNumber: '81234567890', displayName: 'A');
      service.zoomState = 'InMeeting';
      await controller().syncWithZoom();
      expect(state().phase, MeetingPhase.inMeeting);
    });

    test('sync does not end a meeting that has not started yet', () async {
      await setUpContainer();
      await controller().join(meetingNumber: '81234567890', displayName: 'A');
      service.zoomState = 'Idle';
      await controller().syncWithZoom();
      expect(state().phase, MeetingPhase.joining);
    });

    test('it asks about the floating window once, and only while the permission is missing', () async {
      await setUpContainer();
      service.overlay = true;
      expect(await controller().shouldAskForOverlay(), isFalse);
      service.overlay = false;
      expect(await controller().shouldAskForOverlay(), isTrue);
      expect(await controller().shouldAskForOverlay(), isFalse, reason: 'not on every join');
    });
  });
}
