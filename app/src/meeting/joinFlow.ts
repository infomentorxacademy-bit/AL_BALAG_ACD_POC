import { Alert } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

import { activeMeeting, api, sessionStore } from '../controllers';
import { friendlyTokenError, isValidMeetingNumber, normalizeBaseUrl } from '../logic';

/** Ask about the floating-window permission once per app run (not on every join). */
let askedOverlay = false;
export const resetOverlayQuestion = (): void => {
  askedOverlay = false;
};

export interface JoinRequest {
  meetingNumber: string;
  passcode: string;
  userName: string;
}

/**
 * Everything between "the user tapped Join" and "the hidden Zoom host starts joining":
 * validation, the floating-window question, and getting a signed token from the backend.
 * Returns a message to show when it did not start, or null when it did.
 */
export async function startJoin(req: JoinRequest): Promise<string | null> {
  // Zoom is a native module: it is absent in Expo Go and only exists in a dev/production build.
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    Alert.alert('Dev build required', 'Zoom needs a development build (npx expo run:android / run:ios), not Expo Go.');
    return null;
  }
  const mn = req.meetingNumber.replace(/\s/g, '');
  if (!mn) return 'Enter the meeting number';
  if (!isValidMeetingNumber(mn)) return 'A meeting number has 9 to 11 digits';
  if (activeMeeting.isRunning) return 'You are already in a meeting. Return to it, or leave it first.';

  if (!(await activeMeeting.overlayAllowed()) && !askedOverlay) {
    askedOverlay = true;
    const choice = await new Promise<'allow' | 'skip'>((resolve) =>
      Alert.alert(
        'Keep the meeting in a small window?',
        'To keep using the app while you are in a meeting, allow "Display over other apps". Zoom then shows a small floating window you can tap to go back to full screen.',
        [
          { text: 'Not now', style: 'cancel', onPress: () => resolve('skip') },
          { text: 'Allow', onPress: () => resolve('allow') },
        ],
        { cancelable: false },
      ),
    );
    if (choice === 'allow') {
      await activeMeeting.openOverlaySettings();
      return 'After allowing it, come back and tap Join meeting again.';
    }
  }

  try {
    const jwtToken = await api.zoomSignature(mn, 0);
    activeMeeting.start({ jwtToken, meetingNumber: mn, password: req.passcode, userName: req.userName });
    return null;
  } catch (e) {
    return friendlyTokenError(e, normalizeBaseUrl(sessionStore.state.serverUrl));
  }
}
