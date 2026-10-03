import 'dart:convert';

import 'package:al_balag_poc/features/meeting/meeting_service.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:zoom_meeting_bridge/zoom_meeting_bridge.dart';

const _method = MethodChannel('test/zoom');
const _events = EventChannel('test/zoom/events');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final messenger = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

  late MockStreamHandlerEventSink? sink;
  late List<MethodCall> calls;
  late Map<String, Object?> authEvent;
  late Map<String, Object?> joinResult;
  late int tokenRequests;
  late http.Client client;

  ZoomMeetingService service() => ZoomMeetingService(
        baseUrl: () => 'http://server:8000',
        bridge: ZoomMeetingBridge(methodChannel: _method, eventChannel: _events),
        httpClient: client,
      );

  setUp(() {
    sink = null;
    calls = [];
    tokenRequests = 0;
    authEvent = {'type': 'auth', 'code': 0, 'name': 'ZOOM_ERROR_SUCCESS'};
    joinResult = {'code': 0, 'name': 'MEETING_ERROR_SUCCESS'};
    client = MockClient((request) async {
      tokenRequests++;
      expect(request.url.toString(), 'http://server:8000/zoom/signature');
      return http.Response(jsonEncode({'signature': 'jwt-token'}), 200);
    });

    messenger.setMockStreamHandler(
      _events,
      MockStreamHandler.inline(onListen: (args, s) => sink = s),
    );
    messenger.setMockMethodCallHandler(_method, (call) async {
      calls.add(call);
      switch (call.method) {
        case 'initialize':
          // The real SDK reports authentication asynchronously.
          Future<void>.delayed(Duration.zero, () => sink?.success(authEvent));
          return true;
        case 'joinMeeting':
          return joinResult;
      }
      return null;
    });
  });

  tearDown(() {
    messenger.setMockStreamHandler(_events, null);
    messenger.setMockMethodCallHandler(_method, null);
  });

  test('fetches a token, initializes, waits for auth, then joins', () async {
    await service().join(meetingNumber: '81234567890', displayName: 'Alice', passcode: 'pw');

    expect(tokenRequests, 1);
    expect(calls.map((c) => c.method), ['initialize', 'joinMeeting']);
    expect(calls.first.arguments['jwtToken'], 'jwt-token');
    expect(calls.last.arguments['meetingNumber'], '81234567890');
    expect(calls.last.arguments['displayName'], 'Alice');
    expect(calls.last.arguments['password'], 'pw');
  });

  test('a second join reuses the authorized SDK instead of re-initializing', () async {
    final s = service();
    await s.join(meetingNumber: '81234567890', displayName: 'Alice');
    await s.join(meetingNumber: '81234567891', displayName: 'Alice');

    expect(tokenRequests, 1);
    expect(calls.where((c) => c.method == 'initialize'), hasLength(1));
    expect(calls.where((c) => c.method == 'joinMeeting'), hasLength(2));
  });

  test('a rejected token surfaces a helpful message and does not join', () async {
    authEvent = {'type': 'auth', 'code': 5, 'name': 'ZOOM_ERROR_AUTHRET_TOKENWRONG'};
    await expectLater(
      service().join(meetingNumber: '81234567890', displayName: 'Alice'),
      throwsA(isA<MeetingException>().having((e) => e.message, 'message', contains('token'))),
    );
    expect(calls.where((c) => c.method == 'joinMeeting'), isEmpty);
  });

  test('Zoom refusing the join explains the external-meeting limit', () async {
    joinResult = {'code': 66, 'name': 'MEETING_ERROR_UNABLE_TO_JOIN_EXTERNAL_MEETING'};
    await expectLater(
      service().join(meetingNumber: '81234567890', displayName: 'Alice'),
      throwsA(isA<MeetingException>().having((e) => e.message, 'message', contains('same Zoom account'))),
    );
  });

  test('server unreachable gives actionable advice', () async {
    client = MockClient((_) async => throw http.ClientException('no route'));
    await expectLater(
      service().join(meetingNumber: '81234567890', displayName: 'Alice'),
      throwsA(isA<MeetingException>().having((e) => e.message, 'message', contains('Cannot reach the server'))),
    );
  });

  test('server misconfiguration (500) shows the server detail', () async {
    client = MockClient((_) async =>
        http.Response(jsonEncode({'detail': 'ZOOM_SDK_KEY / ZOOM_SDK_SECRET are not configured'}), 500));
    await expectLater(
      service().join(meetingNumber: '81234567890', displayName: 'Alice'),
      throwsA(isA<MeetingException>().having((e) => e.message, 'message', contains('not configured'))),
    );
  });

  test('meeting status events are forwarded with friendly failures', () async {
    final s = service();
    final updates = <MeetingStatusUpdate>[];
    s.statusUpdates.listen(updates.add);
    await s.join(meetingNumber: '81234567890', displayName: 'Alice');

    sink!.success({'type': 'meetingStatus', 'status': 'InMeeting', 'code': 0, 'name': 'MEETING_ERROR_SUCCESS'});
    sink!.success({'type': 'meetingStatus', 'status': 'Failed', 'code': 9, 'name': 'MEETING_ERROR_MEETING_NOT_EXIST'});
    await Future<void>.delayed(Duration.zero);

    expect(updates.map((u) => u.status), ['InMeeting', 'Failed']);
    expect(updates.last.errorMessage, contains('not found'));
  });
}
