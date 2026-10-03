# AL Balag POC: Flutter app

Chat (Sendbird) and Zoom meetings (Zoom Meeting SDK) in one app. Android and iOS.

## Run it

Prerequisites: Flutter 3.47+ (`flutter doctor`), the backend from [`../server`](../server) running, and:
- Android: an emulator or a phone with USB debugging, **or** skip the toolchain and use the CI-built APK (below).
- iOS: a Mac with Xcode and CocoaPods.

```bash
flutter pub get
flutter run --dart-define=API_BASE_URL=http://<your-computer-LAN-IP>:8000
```

- Android emulator: the default `http://10.0.2.2:8000` already reaches your computer, so no flag is needed.
- Physical phone: use your computer's LAN IP (`ipconfig` on Windows). Phone and computer must share Wi-Fi, and the
  firewall must allow port 8000. You can also change the address at runtime from the server icon in the app bar.
- Optional: `--dart-define=SENDBIRD_APP_ID=...` to use a different Sendbird application.

### No Android toolchain? Use the CI APK

Every push runs GitHub Actions. Open **Actions > CI > latest run > Artifacts**, download
`al-balag-poc-debug-apk`, unzip, and install `app-debug.apk` on your phone (allow "install unknown apps").

## Using the app

1. Enter a user id (e.g. `alice`) on two devices (`alice`, `bob`). Both land in the **POC Demo Room**.
2. **Meeting** tab: enter a Zoom meeting number and passcode and tap Join. Host the meeting from the **same Zoom
   account that owns your SDK app**. Zoom restricts unpublished SDK apps from joining other accounts' meetings, and
   the app explains this if Zoom refuses.

## How it is built

```
lib/
  core/        config (--dart-define), theme, shared providers
  features/
    auth/      login + persisted session
    chat/      ChatService (Sendbird) -> ChatController -> ChatScreen
    meeting/   MeetingService (token + Zoom) -> MeetingController -> MeetingScreen, friendly Zoom errors
    settings/  runtime backend-URL setting
packages/
  zoom_meeting_bridge/   small local plugin around the official Zoom Meeting SDK
```

- State management: Riverpod. Services sit behind interfaces, so the UI and controllers are tested with fakes.
- `zoom_meeting_bridge` pulls the official SDK from Maven Central (`us.zoom.meetingsdk:zoomsdk`) and CocoaPods
  (`ZoomMeetingSDK`). There are no manual SDK downloads, and the call sequence mirrors Zoom's own React Native wrapper:
  initialize with a server-signed JWT, wait for the auth result, then join.
- The Zoom token comes from the backend, so the SDK secret is never in the app.

## Tests

```bash
flutter analyze
flutter test
```

## Status and known limits

- Dart code: analyzed and unit/widget tested (including the full token -> init -> auth -> join flow against mocked
  channels). The Android plugin code was compile-checked against the real Zoom SDK jar.
- **Not yet run on a physical device or simulator by the author.** Treat the first device run as the real test.
  Report the exact error if something fails.
- The Android build needs JDK 17+, and the SDK needs Android 9 (API 28) or newer and iOS 15 or newer.
- Android debug builds allow `http://` (for the local backend). Release builds are https-only.
- Joining meetings hosted by other Zoom accounts needs Zoom app approval or an OBF/ZAK token.
