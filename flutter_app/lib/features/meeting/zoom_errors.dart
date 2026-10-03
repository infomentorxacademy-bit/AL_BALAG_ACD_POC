/// Turns native Zoom error names (Android `MEETING_ERROR_*` / `ZOOM_ERROR_*`,
/// iOS `MobileRTCMeetError_*` / `MobileRTCAuthError_*`) into advice a user can act on.
String friendlyZoomMessage(String nativeName) {
  final n = nativeName.toLowerCase().replaceAll('_', '');
  bool has(String s) => n.contains(s);

  if (has('unabletojoinexternalmeeting') ||
      has('hostdisallowoutsideuserjoin') ||
      has('appcannotanonymousjoinmeeting')) {
    return 'Zoom blocked this join. An unpublished SDK app can only join meetings '
        'hosted by the same Zoom account that owns the app (or needs Zoom approval / '
        'an OBF token for other hosts).';
  }
  if (has('incorrectmeetingnumber') || has('meetingnotexist') || has('meetingnotstart')) {
    return 'Meeting not found or not started. Check the meeting number.';
  }
  if (has('password')) return 'The passcode is wrong or missing.';
  if (has('meetingover')) return 'This meeting has already ended.';
  if (has('locked')) return 'The host has locked this meeting.';
  if (has('userfull')) return 'This meeting is full.';
  if (has('removedbyhost')) return 'The host removed you from this meeting.';
  if (has('needsigninforprivatemeeting') || has('blockedbyaccountadmin')) {
    return 'This meeting requires you to sign in, or your account admin blocked access.';
  }
  if (has('tokenwrong') ||
      has('keyorsecret') ||
      has('illegalappkey') ||
      has('accountnotenablesdk') ||
      has('accountnotsupport')) {
    return 'Zoom rejected the SDK token. Check the Client ID/Secret on the server and '
        'that the Meeting SDK is enabled for your Zoom app.';
  }
  if (has('limitexceeded') || has('servicebusy')) {
    return 'Zoom is busy or rate limiting. Wait a moment and try again.';
  }
  if (has('networkunavailable') ||
      has('networkissue') ||
      has('connectionerr') ||
      has('timeout') ||
      has('overtime')) {
    return 'Network problem while contacting Zoom. Check your connection.';
  }
  if (has('devicenotsupported')) return 'This device is not supported by the Zoom SDK.';
  if (has('inanothermeeting')) return 'You are already in another meeting.';
  return 'Zoom error: $nativeName';
}

/// Validates and normalizes a Zoom meeting number (9 to 11 digits, spaces/dashes ignored).
String? validateMeetingNumber(String? input) {
  final digits = (input ?? '').replaceAll(RegExp(r'[\s-]'), '');
  if (digits.isEmpty) return 'Enter the meeting number';
  if (!RegExp(r'^\d+$').hasMatch(digits)) return 'Digits only';
  if (digits.length < 9 || digits.length > 11) return 'A meeting number has 9 to 11 digits';
  return null;
}

String normalizeMeetingNumber(String input) => input.replaceAll(RegExp(r'[\s-]'), '');

/// "81234567890" -> "812 3456 7890" for display.
String formatMeetingNumber(String digits) {
  final d = normalizeMeetingNumber(digits);
  if (d.length <= 3) return d;
  if (d.length <= 7) return '${d.substring(0, 3)} ${d.substring(3)}';
  return '${d.substring(0, 3)} ${d.substring(3, 7)} ${d.substring(7)}';
}
