/// Thin bridge to the official Zoom Meeting SDK.
///
/// Flow: [ZoomMeetingBridge.initialize] with a server-signed SDK JWT, wait for
/// a [ZoomAuthEvent] with `success == true`, then [ZoomMeetingBridge.joinMeeting].
library;

import 'dart:async';

import 'package:flutter/services.dart';

/// Events emitted by the native Zoom SDK.
sealed class ZoomEvent {
  const ZoomEvent();

  factory ZoomEvent.fromMap(Map<Object?, Object?> map) {
    final type = map['type'] as String?;
    final code = (map['code'] as num?)?.toInt() ?? 0;
    final name = map['name'] as String? ?? 'UNKNOWN';
    switch (type) {
      case 'auth':
        return ZoomAuthEvent(code: code, name: name);
      case 'authExpired':
        return const ZoomAuthExpiredEvent();
      case 'meetingStatus':
        return ZoomMeetingStatusEvent(
          status: map['status'] as String? ?? 'Unknown',
          errorCode: code,
          errorName: name,
        );
      default:
        return ZoomUnknownEvent(Map<String, Object?>.from(map));
    }
  }
}

/// Result of SDK authentication (JWT validation).
class ZoomAuthEvent extends ZoomEvent {
  const ZoomAuthEvent({required this.code, required this.name});

  final int code;

  /// Native error name, e.g. `ZOOM_ERROR_SUCCESS` or `MobileRTCAuthError_TokenWrong`.
  final String name;

  bool get success => code == 0;
}

class ZoomAuthExpiredEvent extends ZoomEvent {
  const ZoomAuthExpiredEvent();
}

/// Meeting lifecycle change, e.g. `Connecting`, `InMeeting`, `Ended`, `Failed`.
class ZoomMeetingStatusEvent extends ZoomEvent {
  const ZoomMeetingStatusEvent({
    required this.status,
    required this.errorCode,
    required this.errorName,
  });

  final String status;
  final int errorCode;
  final String errorName;

  bool get isFailed => status == 'Failed';
  bool get isInMeeting => status == 'InMeeting';
  bool get isEnded => status == 'Ended';
}

class ZoomUnknownEvent extends ZoomEvent {
  const ZoomUnknownEvent(this.raw);
  final Map<String, Object?> raw;
}

/// Result of a `joinMeeting` call (the request was accepted or rejected locally;
/// progress arrives later as [ZoomMeetingStatusEvent]s).
class ZoomJoinResult {
  const ZoomJoinResult({required this.code, required this.name});

  final int code;
  final String name;

  bool get accepted => code == 0;
}

class ZoomMeetingBridge {
  ZoomMeetingBridge({MethodChannel? methodChannel, EventChannel? eventChannel})
      : _method = methodChannel ?? const MethodChannel('zoom_meeting_bridge'),
        _events = eventChannel ?? const EventChannel('zoom_meeting_bridge/events');

  final MethodChannel _method;
  final EventChannel _events;

  Stream<ZoomEvent>? _stream;

  /// Broadcast stream of native SDK events.
  Stream<ZoomEvent> get events => _stream ??= _events
      .receiveBroadcastStream()
      .where((e) => e is Map)
      .map((e) => ZoomEvent.fromMap(e as Map<Object?, Object?>))
      .asBroadcastStream();

  /// Initializes the SDK and authenticates with [jwtToken]. The outcome is
  /// reported as a [ZoomAuthEvent]. Returns whether initialization started.
  Future<bool> initialize({
    required String jwtToken,
    String domain = 'zoom.us',
    bool enableLog = true,
  }) async {
    final ok = await _method.invokeMethod<bool>('initialize', {
      'jwtToken': jwtToken,
      'domain': domain,
      'enableLog': enableLog,
    });
    return ok ?? false;
  }

  Future<bool> isInitialized() async =>
      await _method.invokeMethod<bool>('isInitialized') ?? false;

  Future<ZoomJoinResult> joinMeeting({
    required String meetingNumber,
    required String displayName,
    String? password,
    bool noAudio = false,
    bool noVideo = false,
  }) async {
    final res = await _method.invokeMapMethod<String, Object?>('joinMeeting', {
      'meetingNumber': meetingNumber,
      'displayName': displayName,
      'password': password ?? '',
      'noAudio': noAudio,
      'noVideo': noVideo,
    });
    return ZoomJoinResult(
      code: (res?['code'] as num?)?.toInt() ?? -1,
      name: res?['name'] as String? ?? 'UNKNOWN',
    );
  }

  Future<void> uninitialize() => _method.invokeMethod<void>('uninitialize');
}
