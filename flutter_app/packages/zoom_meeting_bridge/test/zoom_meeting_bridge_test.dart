import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zoom_meeting_bridge/zoom_meeting_bridge.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const method = MethodChannel('zoom_meeting_bridge');
  final messenger = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  late List<MethodCall> calls;

  setUp(() {
    calls = [];
    messenger.setMockMethodCallHandler(method, (call) async {
      calls.add(call);
      switch (call.method) {
        case 'initialize':
          return true;
        case 'isInitialized':
          return false;
        case 'joinMeeting':
          return {'code': 0, 'name': 'MEETING_ERROR_SUCCESS'};
        case 'canDrawOverlays':
          return false;
        case 'meetingState':
          return 'InMeeting';
      }
      return null;
    });
  });

  tearDown(() => messenger.setMockMethodCallHandler(method, null));

  test('initialize passes the token and defaults', () async {
    final ok = await ZoomMeetingBridge().initialize(jwtToken: 'jwt');
    expect(ok, isTrue);
    expect(calls.single.arguments, {'jwtToken': 'jwt', 'domain': 'zoom.us', 'enableLog': true});
  });

  test('joinMeeting sends all fields and parses the result', () async {
    final result = await ZoomMeetingBridge().joinMeeting(
      meetingNumber: '81234567890',
      displayName: 'Alice',
      password: 'pw',
      noVideo: true,
    );
    expect(result.accepted, isTrue);
    expect(result.name, 'MEETING_ERROR_SUCCESS');
    expect(calls.single.arguments, {
      'meetingNumber': '81234567890',
      'displayName': 'Alice',
      'password': 'pw',
      'noAudio': false,
      'noVideo': true,
    });
  });

  test('a missing password is sent as an empty string', () async {
    await ZoomMeetingBridge().joinMeeting(meetingNumber: '81234567890', displayName: 'A');
    expect(calls.single.arguments['password'], '');
  });

  test('isInitialized is false when the platform says so', () async {
    expect(await ZoomMeetingBridge().isInitialized(), isFalse);
  });

  group('ZoomEvent.fromMap', () {
    test('auth success and failure', () {
      final ok = ZoomEvent.fromMap({'type': 'auth', 'code': 0, 'name': 'ZOOM_ERROR_SUCCESS'});
      expect(ok, isA<ZoomAuthEvent>().having((e) => e.success, 'success', isTrue));
      final bad = ZoomEvent.fromMap({'type': 'auth', 'code': 5, 'name': 'ZOOM_ERROR_AUTHRET_TOKENWRONG'});
      expect(bad, isA<ZoomAuthEvent>().having((e) => e.success, 'success', isFalse));
    });

    test('meeting status', () {
      final e = ZoomEvent.fromMap(
          {'type': 'meetingStatus', 'status': 'Failed', 'code': 9, 'name': 'MEETING_ERROR_MEETING_NOT_EXIST'});
      expect(e, isA<ZoomMeetingStatusEvent>()
          .having((e) => e.isFailed, 'isFailed', isTrue)
          .having((e) => e.errorName, 'errorName', 'MEETING_ERROR_MEETING_NOT_EXIST'));
    });

    test('auth expiry and unknown types', () {
      expect(ZoomEvent.fromMap({'type': 'authExpired'}), isA<ZoomAuthExpiredEvent>());
      expect(ZoomEvent.fromMap({'type': 'wat'}), isA<ZoomUnknownEvent>());
    });
  });

  group('floating mini window', () {
    test('canDrawOverlays asks the platform', () async {
      expect(await ZoomMeetingBridge().canDrawOverlays(), isFalse);
      expect(calls.single.method, 'canDrawOverlays');
    });

    test('requestOverlayPermission opens the system settings', () async {
      await ZoomMeetingBridge().requestOverlayPermission();
      expect(calls.single.method, 'requestOverlayPermission');
    });

    test('returnToMeeting brings the meeting back', () async {
      await ZoomMeetingBridge().returnToMeeting();
      expect(calls.single.method, 'returnToMeeting');
    });

    test('meetingState reports what Zoom says', () async {
      expect(await ZoomMeetingBridge().meetingState(), 'InMeeting');
    });

    test('the minimized event is understood', () {
      final event = ZoomEvent.fromMap({'type': 'minimized'});
      expect(event, isA<ZoomMinimizedEvent>());
    });
  });
}
