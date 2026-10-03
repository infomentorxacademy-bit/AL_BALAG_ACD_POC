import 'package:al_balag_poc/features/meeting/zoom_errors.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('friendlyZoomMessage', () {
    test('explains the external-meeting restriction on both platforms', () {
      for (final name in [
        'MEETING_ERROR_UNABLE_TO_JOIN_EXTERNAL_MEETING',
        'MobileRTCMeetError_UnableToJoinExternalMeeting',
        'MEETING_ERROR_APP_CAN_NOT_ANONYMOUS_JOIN_MEETING',
      ]) {
        expect(friendlyZoomMessage(name), contains('same Zoom account'), reason: name);
      }
    });

    test('maps common problems', () {
      expect(friendlyZoomMessage('MEETING_ERROR_MEETING_NOT_EXIST'), contains('not found'));
      expect(friendlyZoomMessage('MEETING_ERROR_INCORRECT_MEETING_NUMBER'), contains('not found'));
      expect(friendlyZoomMessage('MobileRTCMeetError_PasswordError'), contains('passcode'));
      expect(friendlyZoomMessage('MEETING_ERROR_MEETING_OVER'), contains('ended'));
      expect(friendlyZoomMessage('MEETING_ERROR_LOCKED'), contains('locked'));
      expect(friendlyZoomMessage('ZOOM_ERROR_AUTHRET_TOKENWRONG'), contains('token'));
      expect(friendlyZoomMessage('MobileRTCAuthError_KeyOrSecretWrong'), contains('token'));
      expect(friendlyZoomMessage('ZOOM_ERROR_NETWORK_UNAVAILABLE'), contains('Network'));
    });

    test('falls back to the raw name for unknown errors', () {
      expect(friendlyZoomMessage('SOMETHING_NEW'), 'Zoom error: SOMETHING_NEW');
    });
  });

  group('meeting number helpers', () {
    test('validate', () {
      expect(validateMeetingNumber(''), isNotNull);
      expect(validateMeetingNumber('abc123456789'), isNotNull);
      expect(validateMeetingNumber('12345678'), isNotNull); // 8 digits
      expect(validateMeetingNumber('123456789012'), isNotNull); // 12 digits
      expect(validateMeetingNumber('123456789'), isNull);
      expect(validateMeetingNumber('812 3456 7890'), isNull);
      expect(validateMeetingNumber('812-3456-7890'), isNull);
    });

    test('normalize and format round trip', () {
      expect(normalizeMeetingNumber('812 3456-7890'), '81234567890');
      expect(formatMeetingNumber('81234567890'), '812 3456 7890');
      expect(formatMeetingNumber('8123'), '812 3');
      expect(formatMeetingNumber('81'), '81');
    });
  });
}
