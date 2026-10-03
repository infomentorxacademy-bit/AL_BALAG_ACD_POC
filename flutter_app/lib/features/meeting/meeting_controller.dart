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
  });

  final MeetingPhase phase;
  final String? error;

  /// Most recent meeting numbers (digits only), newest first.
  final List<String> recent;

  bool get busy => phase == MeetingPhase.preparing || phase == MeetingPhase.joining;

  MeetingState copyWith({MeetingPhase? phase, String? error, bool clearError = false, List<String>? recent}) =>
      MeetingState(
        phase: phase ?? this.phase,
        error: clearError ? null : (error ?? this.error),
        recent: recent ?? this.recent,
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
  Timer? _watchdog;

  @override
  MeetingState build() {
    ref.onDispose(() {
      _sub?.cancel();
      _watchdog?.cancel();
    });
    _sub = ref.read(meetingServiceProvider).statusUpdates.listen(_onStatus);
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
    state = state.copyWith(phase: MeetingPhase.preparing, clearError: true);
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
        state = state.copyWith(phase: MeetingPhase.inMeeting, clearError: true);
      case 'Failed':
        state = state.copyWith(
          phase: MeetingPhase.error,
          error: update.errorMessage ?? 'Could not join the meeting.',
        );
      case 'Ended' || 'Idle':
        if (state.phase == MeetingPhase.inMeeting || state.phase == MeetingPhase.joining) {
          state = state.copyWith(phase: MeetingPhase.idle, clearError: true);
        }
      default:
        break;
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
