# Working on this project on your own Windows PC

Use **Command Prompt (cmd)** or **PowerShell**. Run one command per line.

## 1. Install once
- Git, Node.js (LTS), Python 3.11+, Android Studio (with Android SDK), Flutter SDK
- Claude Code: `npm install -g @anthropic-ai/claude-code`

## 2. Get the code
```
git clone https://github.com/infomentorxacademy-bit/AL_BALAG_ACD_POC.git
cd AL_BALAG_ACD_POC
git checkout claude/nifty-volta-9nrnex
```

## 3. Work with Claude on your PC
```
claude
```
Claude now edits the files on your PC. Save to GitHub by asking it to "commit and push", or run `git add -A`, `git commit -m "message"`, `git push`.
Get cloud changes with `git pull`. Work in one place at a time.

## 4. Backend (signs Zoom tokens)
```
cd server
copy .env.example .env
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```
Put your Zoom SDK key and secret only in `server\.env` (never commit it).
Also set `ADMIN_KEY=` (any long phrase you choose; typing it under Advanced on the login screen makes you an admin) and `APP_JWT_SECRET=` (a long random string).
Find your PC's LAN IP with `ipconfig` (IPv4 Address). The phone and PC must be on the same Wi-Fi.

## 5. Flutter app (phone connected by USB, USB debugging on)
```
cd flutter_app
flutter pub get
flutter run --dart-define=API_BASE_URL=http://YOUR-PC-IP:8000
```
Tests: `flutter test`

## 6. React Native app
```
cd app
npm install
npx expo prebuild --platform android
npx expo run:android
```
Set `EXPO_PUBLIC_API_BASE_URL=http://YOUR-PC-IP:8000` first (`set EXPO_PUBLIC_API_BASE_URL=...` in cmd).
Tests: `npm test` and `npm run test:ui`

## Crash logs
```
adb logcat -c
adb logcat -d -s AndroidRuntime:E
```
