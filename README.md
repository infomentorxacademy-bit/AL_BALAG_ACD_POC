# AL Balag Academy POC

A proof of concept for **in-app chat** (Sendbird) and **in-app Zoom meetings** (Zoom Meeting SDK).

| Folder | What it is |
|---|---|
| [`flutter_app/`](flutter_app) | **Main app: Flutter** (Android + iOS). Start here. |
| [`server/`](server) | FastAPI backend that signs Zoom SDK tokens (the Zoom secret never ships in the app). |
| [`app/`](app) | React Native (Expo) version for comparison. Built in CI too, but `flutter_app/` is the main app. |

```
┌──────────────┐  chat   ┌───────────┐
│ Flutter app  │────────▶│ Sendbird  │
│              │         └───────────┘
│  Chat tab    │  token  ┌────────────┐        ┌──────┐
│  Meeting tab │────────▶│ FastAPI    │        │ Zoom │
│              │         │ /zoom/...  │        │      │
│  zoom_meeting│  join (native Zoom Meeting SDK, no server in the media path)
│  _bridge ────┼────────────────────────────────▶      │
└──────────────┘                                └──────┘
```

## Quick start

1. **Backend** (needs your Zoom Meeting SDK Client ID and Secret):
   ```bash
   cd server
   cp .env.example .env            # fill ZOOM_SDK_KEY / ZOOM_SDK_SECRET
   python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```
2. **App**: see [`flutter_app/README.md`](flutter_app/README.md). The short version:
   ```bash
   cd flutter_app
   flutter pub get
   flutter run --dart-define=API_BASE_URL=http://<your-computer-LAN-IP>:8000
   ```

## Install on a phone (no PC toolchain needed)

Every push builds the APKs in GitHub Actions and publishes them to one rolling release. Open this on the phone:

**https://github.com/infomentorxacademy-bit/AL_BALAG_ACD_POC/releases/tag/latest**

| File | What it is |
|---|---|
| `AL-Balag-Flutter-debug.apk` | Main app. Use this one for testing (plain `http://` to a PC backend works). |
| `AL-Balag-Flutter-release.apk` | Same app, release build. |
| `AL-Balag-ReactNative-release.apk` | React Native build for comparison. |

(The same files are also under **Actions > CI > latest run > Artifacts**, as zips.)

## What the Flutter app does

- **Chats tab**: list of conversations with unread badges and last-message preview, pull to refresh, new direct
  chat or group by user id, leave a chat. A shared public room (**POC Demo Room**) is joined automatically.
- **Conversation**: send text and photos, reply with a quote, edit and delete your own messages, emoji reactions,
  typing indicator, read receipts (one tick sent, two blue ticks seen), date separators, earlier-message paging,
  members list, retry for failed sends.
- **Meeting tab**: join a Zoom meeting inside the app (native Zoom Meeting SDK) with friendly error messages.
  - **Mini window**: after joining, allow "Display over other apps" once, then tap minimize in Zoom. The meeting shrinks to a small floating window; a green "In a meeting · Return" bar shows on every screen so chat stays usable. Return restores full screen. (Android; needs on-device verification.)
- **Server setting** (top bar): point the app at your backend at run time, no rebuild.

## Credentials

- **Sendbird App ID** is a public client identifier and is already the default in the app.
- **Zoom Client ID / Secret** go only in `server/.env` (gitignored). Never commit or paste the secret.
  Create a *Meeting SDK* app at https://marketplace.zoom.us (Develop > Build App).

## Tests

```bash
cd server && pytest                                   # backend
cd flutter_app && flutter test                        # app (chat list, conversation, meeting, UI, Zoom flow)
cd flutter_app/packages/zoom_meeting_bridge && flutter test   # native bridge (Dart side)
cd app && npm test && npm run test:ui                # React Native: logic (Node) and screens (test renderer)
```
CI runs all of them plus `flutter analyze`, real `flutter build apk` (debug + release) and an Expo/React Native release build.

## Path to production

- Sendbird: issue **session tokens** from the backend instead of user-id-only login; consider Sendbird UIKit for Flutter.
- Zoom: authenticate `/zoom/signature` (it is open in the POC), restrict CORS, serve over HTTPS, and complete
  Zoom's app review so the app can join meetings hosted by other accounts.
- Release signing, store listings, push notifications (Sendbird + FCM/APNs), crash reporting.
