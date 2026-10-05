import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';

import type { ZoomWindowApi } from './activeMeeting';

// Bridge to the native Zoom module (RNZoomSDK). The extra methods used here come from our patch of
// @zoom/meetingsdk-react-native (see patches/). Everything is guarded so the app still runs where the
// module is missing (Expo Go) or where a method does not exist (iOS).

type Native = Partial<{
  canDrawOverlays(): Promise<boolean>;
  requestOverlayPermission(): Promise<boolean>;
  returnToMeeting(): Promise<boolean>;
  getMeetingState(): Promise<string>;
}>;

const native = (): Native => (NativeModules.RNZoomSDK ?? {}) as Native;

export const zoomWindow: ZoomWindowApi = {
  async canDrawOverlays() {
    if (Platform.OS !== 'android') return true; // iOS has no such permission.
    return native().canDrawOverlays ? native().canDrawOverlays!() : true;
  },
  async requestOverlayPermission() {
    await native().requestOverlayPermission?.();
  },
  async returnToMeeting() {
    await native().returnToMeeting?.();
  },
  async getMeetingState() {
    return native().getMeetingState ? native().getMeetingState!() : 'Unknown';
  },
  onState(listener) {
    const sub = DeviceEventEmitter.addListener('onMeetingStateChange', (e: { state?: string } | null) =>
      listener(String(e?.state ?? '')),
    );
    return () => sub.remove();
  },
  onMinimized(listener) {
    const sub = DeviceEventEmitter.addListener('onMeetingMinimized', () => listener());
    return () => sub.remove();
  },
};
