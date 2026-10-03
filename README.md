# AL Balag Academy POC

A proof of concept for **in-app chat** (Sendbird) and **in-app Zoom meetings** (Zoom Meeting SDK).

| Folder | What it is |
|---|---|
| [`flutter_app/`](flutter_app) | **Main app: Flutter** (Android + iOS). Start here. |
| [`server/`](server) | FastAPI backend that signs Zoom SDK tokens (the Zoom secret never ships in the app). |
| [`app/`](app) | Earlier React Native (Expo) version, kept for reference. Superseded by `flutter_app/`. |

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

No local Android toolchain? Every push builds an installable APK in GitHub Actions
(**Actions > CI > latest run > Artifacts > `al-balag-poc-debug-apk`**).

## Credentials

- **Sendbird App ID** is a public client identifier and is already the default in the app.
- **Zoom Client ID / Secret** go only in `server/.env` (gitignored). Never commit or paste the secret.
  Create a *Meeting SDK* app at https://marketplace.zoom.us (Develop > Build App).

## Tests

```bash
cd server && pytest                                   # backend
cd flutter_app && flutter test                        # app (chat, meeting, UI, Zoom flow)
cd flutter_app/packages/zoom_meeting_bridge && flutter test   # native bridge (Dart side)
```
CI runs all of them plus `flutter analyze` and a real `flutter build apk`.

## Path to production

- Sendbird: issue **session tokens** from the backend instead of user-id-only login; consider Sendbird UIKit for Flutter.
- Zoom: authenticate `/zoom/signature` (it is open in the POC), restrict CORS, serve over HTTPS, and complete
  Zoom's app review so the app can join meetings hosted by other accounts.
- Release signing, store listings, push notifications (Sendbird + FCM/APNs), crash reporting.
