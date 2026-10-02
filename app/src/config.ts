// Values come from app/.env (EXPO_PUBLIC_* are inlined at bundle time).
export const config = {
  sendbirdAppId: process.env.EXPO_PUBLIC_SENDBIRD_APP_ID ?? '',
  // Android emulator reaches the host machine at 10.0.2.2; override for real devices.
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://10.0.2.2:8000',
  demoChannelUrl: 'poc-demo-room',
};
