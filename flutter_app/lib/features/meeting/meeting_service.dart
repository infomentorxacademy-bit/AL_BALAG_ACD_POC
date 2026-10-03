import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:zoom_meeting_bridge/zoom_meeting_bridge.dart';

import 'zoom_errors.dart';

/// Thrown with a message that is safe to show to the user.
class MeetingException implements Exception {
  const MeetingException(this.message);
  final String message;

  @override
  String toString() => message;
}

/// Lifecycle updates once a join has been accepted.
class MeetingStatusUpdate {
  const MeetingStatusUpdate({required this.status, this.errorMessage});

  /// Zoom status name, e.g. `Connecting`, `InMeeting`, `Ended`, `Failed`.
  final String status;
  final String? errorMessage;
}

abstract class MeetingService {
  Stream<MeetingStatusUpdate> get statusUpdates;

  /// Authorizes (first time only) and asks Zoom to join. Throws [MeetingException].
  Future<void> join({
    required String meetingNumber,
    required String displayName,
    String? passcode,
  });
}

class ZoomMeetingService implements MeetingService {
  ZoomMeetingService({
    required this.baseUrl,
    ZoomMeetingBridge? bridge,
    http.Client? httpClient,
  })  : _bridge = bridge ?? ZoomMeetingBridge(),
        _http = httpClient ?? http.Client();

  /// Read at call time so a changed server address applies immediately.
  final String Function() baseUrl;
  final ZoomMeetingBridge _bridge;
  final http.Client _http;

  final _status = StreamController<MeetingStatusUpdate>.broadcast();
  StreamSubscription<ZoomEvent>? _sub;
  Completer<ZoomAuthEvent>? _authWaiter;
  bool _authorized = false;

  @override
  Stream<MeetingStatusUpdate> get statusUpdates => _status.stream;

  void _listen() {
    _sub ??= _bridge.events.listen(_onEvent);
  }

  void _onEvent(ZoomEvent event) {
    switch (event) {
      case ZoomAuthEvent():
        _authorized = event.success;
        final waiter = _authWaiter;
        if (waiter != null && !waiter.isCompleted) waiter.complete(event);
      case ZoomAuthExpiredEvent():
        _authorized = false;
      case ZoomMeetingStatusEvent():
        _status.add(MeetingStatusUpdate(
          status: event.status,
          errorMessage: event.isFailed ? friendlyZoomMessage(event.errorName) : null,
        ));
      case ZoomUnknownEvent():
        break;
    }
  }

  @override
  Future<void> join({
    required String meetingNumber,
    required String displayName,
    String? passcode,
  }) async {
    _listen();
    await _ensureAuthorized();
    final ZoomJoinResult result;
    try {
      result = await _bridge.joinMeeting(
        meetingNumber: meetingNumber,
        displayName: displayName,
        password: passcode,
      );
    } on Exception catch (e) {
      throw MeetingException('Could not start the Zoom meeting: $e');
    }
    if (!result.accepted) {
      throw MeetingException(friendlyZoomMessage(result.name));
    }
  }

  Future<void> _ensureAuthorized() async {
    if (_authorized) return;
    final jwt = await _fetchSdkToken();
    final waiter = _authWaiter = Completer<ZoomAuthEvent>();
    try {
      final started = await _bridge.initialize(jwtToken: jwt);
      if (!started) throw const MeetingException('The Zoom SDK could not start.');
      final auth = await waiter.future.timeout(const Duration(seconds: 25));
      if (!auth.success) throw MeetingException(friendlyZoomMessage(auth.name));
    } on TimeoutException {
      throw const MeetingException('Zoom did not respond in time. Check your network and try again.');
    } finally {
      _authWaiter = null;
    }
  }

  Future<String> _fetchSdkToken() async {
    final url = Uri.parse('${baseUrl()}/zoom/signature');
    try {
      final res = await _http
          .post(url, headers: {'Content-Type': 'application/json'}, body: jsonEncode({'role': 0}))
          .timeout(const Duration(seconds: 10));
      if (res.statusCode != 200) {
        throw MeetingException(_describeServerError(res));
      }
      final signature = (jsonDecode(res.body) as Map<String, dynamic>)['signature'];
      if (signature is! String || signature.isEmpty) {
        throw const MeetingException('The server returned an empty Zoom token.');
      }
      return signature;
    } on TimeoutException {
      throw MeetingException('The server at ${baseUrl()} did not answer. Is it running?');
    } on http.ClientException {
      throw MeetingException(
          'Cannot reach the server at ${baseUrl()}. Start it, check the Wi-Fi, '
          'and set the correct address in Settings.');
    } on FormatException {
      throw const MeetingException('The server sent an unexpected response.');
    }
  }

  String _describeServerError(http.Response res) {
    try {
      final detail = (jsonDecode(res.body) as Map<String, dynamic>)['detail'];
      if (detail is String) return 'Server error (${res.statusCode}): $detail';
    } catch (_) {}
    return 'Server error (${res.statusCode}).';
  }
}
