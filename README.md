# AL Balag Academy POC

React Native (Expo) proof of concept with:

- **Sendbird Chat** – real-time group chat in a shared public room (`@sendbird/chat` JS SDK + a minimal custom UI)
- **Zoom Meeting SDK** – join a Zoom meeting natively in-app (`@zoom/meetingsdk-react-native`)
- **FastAPI backend** (`server/`) – signs Zoom SDK JWTs so the SDK secret never ships in the app

```
app/      Expo (TypeScript) mobile app
server/   FastAPI service: POST /zoom/signature
```

## Prerequisites (one-time)

1. **Sendbird**: create an app at https://dashboard.sendbird.com and copy the *Application ID*.
2. **Zoom**: at https://marketplace.zoom.us create a **Meeting SDK** app and copy its *SDK Key* and *SDK Secret*.
3. Android Studio (and/or Xcode on macOS), Node 20+, Python 3.11+.

## Run the backend

```bash
cd server
cp .env.example .env        # fill ZOOM_SDK_KEY / ZOOM_SDK_SECRET
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest                      # optional
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Run the app

```bash
cd app
cp .env.example .env        # fill EXPO_PUBLIC_SENDBIRD_APP_ID, EXPO_PUBLIC_API_BASE_URL
npm install
npx expo run:android        # or: npx expo run:ios   (creates a dev build)
```

> **Expo Go is not enough for Zoom.** The Zoom SDK is a native module, so you need a development build
> (`expo-dev-client` is already configured). The **Chat tab works in Expo Go** (`npx expo start`); the Meeting tab shows a hint there.
>
> Physical device: set `EXPO_PUBLIC_API_BASE_URL=http://<your-LAN-IP>:8000`.

## Try it

1. Launch on two devices/emulators, log in with different user ids (`alice`, `bob`) → chat in the *POC Demo Room*.
2. Start a Zoom meeting from the Zoom client, open the **Meeting** tab, enter the meeting number/passcode → *Join*.

## Path to production (after the POC)

- Sendbird: issue **session tokens** from the backend instead of user-id-only auth; consider `@sendbird/uikit-react-native` for ready-made UI.
- Zoom: authenticate the `/zoom/signature` endpoint (it is open in the POC) and restrict CORS.
- Add EAS Build, push notifications (Sendbird + FCM/APNs), and error monitoring.
