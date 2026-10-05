import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../settings/settings_controller.dart';
import 'meeting_service.dart';
import 'zoom_errors.dart';

enum MeetingPhase { idle, preparing, joining, inMeeting, error }

class MeetingState {
  const MeetingState({
    this.phase = MeetingPhase.idle,
    this.error,
    this.recent = const [],
    this.number,
  });

  final MeetingPhase phase;
  final String? error;

  /// The meeting being joined or attended (digits only).
  final String? number;

  /// Most recent meeting numbers (digits only), newest first.
  final List<String> recent;

  bool get busy => phase == MeetingPhase.preparing || phase == MeetingPhase.joining;

  /// A meeting is being joined or attended: the join form is replaced by the meeting card.
  bool get inProgress => phase == MeetingPhase.joining || phase == MeetingPhase.inMeeting;

  MeetingState copyWith({
    MeetingPhase? phase,
    String? error,
    bool clearError = false,
    List<String>? recent,
    String? number,
    bool clearNumber = false,
  }) =>
      MeetingState(
        phase: phase ?? this.phase,
        error: clearError ? null : (error ?? this.error),
        recent: recent ?? this.recent,
        number: clearNumber ? null : (number ?? this.number),
      );
}

final meetingServiceProvider = Provider<MeetingService>((ref) {
  return ZoomMeetingService(baseUrl: () => ref.read(apiBaseUrlProvider));
});

const _recentKey = 'recent_meetings';
const _maxRecent = 5;

/// How long to wait for Zoom to report progress after it accepted a join.
const joinWatchdogTimeout = Duration(seconds: 45);

class MeetingController extends Notifier<MeetingState> {
  StreamSubscription<MeetingStatusUpdate>? _sub;
  StreamSubscription<void>? _minSub;
  Timer? _watchdog;

  /// Zoom can report "Idle" before a join has even started: only believe it once we were in the meeting.
  bool _seenInMeeting = false;
  bool _askedOverlay = false;

  @override
  MeetingState build() {
    ref.onDispose(() {
      _sub?.cancel();
      _minSub?.cancel();
      _watchdog?.cancel();
    });
    final service = ref.read(meetingServiceProvider);
    _sub = service.statusUpdates.listen(_onStatus);
    _minSub = service.minimized.listen((_) => _onMinimized());
    final recent = ref.read(sharedPreferencesProvider).getStringList(_recentKey) ?? const [];
    return MeetingState(recent: recent);
  }

  Future<void> join({
    required String meetingNumber,
    required String displayName,
    String? passcode,
  }) async {
    if (state.busy) return;
    final number = normalizeMeetingNumber(meetingNumber);
    final problem = validateMeetingNumber(number);
    if (problem != null) {
      state = state.copyWith(phase: MeetingPhase.error, error: problem);
      return;
    }
    _seenInMeeting = false;
    state = state.copyWith(phase: MeetingPhase.preparing, clearError: true, number: number);
    try {
      await ref.read(meetingServiceProvider).join(
            meetingNumber: number,
            displayName: displayName,
            passcode: (passcode?.isEmpty ?? true) ? null : passcode,
          );
      // Zoom accepted the request; status events (Connecting -> InMeeting) take over from here.
      if (state.phase == MeetingPhase.preparing) {
        state = state.copyWith(phase: MeetingPhase.joining);
        _watchdog?.cancel();
        _watchdog = Timer(joinWatchdogTimeout, _onWatchdog);
      }
      await _remember(number);
    } on MeetingException catch (e) {
      state = state.copyWith(phase: MeetingPhase.error, error: e.message);
    } catch (e) {
      state = state.copyWith(phase: MeetingPhase.error, error: 'Unexpected error: $e');
    }
  }

  void dismissError() {
    if (state.phase == MeetingPhase.error) {
      state = state.copyWith(phase: MeetingPhase.idle, clearError: true);
    }
  }

  /// Zoom accepted the join but never reported a status: don't leave the button stuck.
  void _onWatchdog() {
    if (state.phase == MeetingPhase.joining) {
      state = state.copyWith(
        phase: MeetingPhase.error,
        error: 'Zoom did not start the meeting. Check the number and passcode, then try again.',
      );
    }
  }

  void _onStatus(MeetingStatusUpdate update) {
    _watchdog?.cancel();
    switch (update.status) {
      case 'InMeeting':
        _seenInMeeting = true;
        state = state.copyWith(phase: MeetingPhase.inMeeting, clearError: true);
      case 'Failed':
        state = state.copyWith(
          phase: MeetingPhase.error,
          clearNumber: true,
          error: update.errorMessage ?? 'Could not join the meeting.',
        );
      case 'Ended' || 'Idle':
        final over = update.status == 'Ended' || _seenInMeeting;
        if (over && state.inProgress) _finish();
      default:
        break;
    }
  }

  void _finish() => state = state.copyWith(phase: MeetingPhase.idle, clearError: true, clearNumber: true);

  void _onMinimized() {
    if (state.inProgress) {
      _seenInMeeting = true;
      state = state.copyWith(phase: MeetingPhase.inMeeting);
    }
  }

  // ---- keeping the meeting reachable while the user uses the app ----

  /// Whether the floating mini window may be shown ("Display over other apps").
  Future<bool> overlayAllowed() => ref.read(meetingServiceProvider).overlayAllowed();

  Future<void> openOverlaySettings() => ref.read(meetingServiceProvider).openOverlaySettings();

  /// True once per app run, and only while the permission is missing: time to explain and ask.
  Future<bool> shouldAskForOverlay() async {
    if (_askedOverlay) return false;
    if (await overlayAllowed()) return false;
    _askedOverlay = true;
    return true;
  }

  /// Back to the full-screen meeting.
  Future<void> returnToMeeting() async {
    if (!state.inProgress) return;
    try {
      await ref.read(meetingServiceProvider).returnToMeeting();
    } on Exception {
      // The meeting may have just ended; check, and clean up if so.
      await syncWithZoom();
    }
  }

  /// Call when the app comes back to the foreground: Zoom events may have been missed.
  Future<void> syncWithZoom() async {
    if (!state.inProgress) return;
    final String zoomState;
    try {
      zoomState = await ref.read(meetingServiceProvider).meetingState();
    } on Exception {
      return;
    }
    if (zoomState == 'InMeeting') {
      _seenInMeeting = true;
      state = state.copyWith(phase: MeetingPhase.inMeeting);
    } else if (_seenInMeeting && (zoomState == 'Idle' || zoomState == 'Ended')) {
      _finish();
    }
  }

  Future<void> _remember(String number) async {
    final updated = [number, ...state.recent.where((n) => n != number)].take(_maxRecent).toList();
    state = state.copyWith(recent: updated);
    await ref.read(sharedPreferencesProvider).setStringList(_recentKey, updated);
  }
}

final meetingControllerProvider =
    NotifierProvider<MeetingController, MeetingState>(MeetingController.new);
