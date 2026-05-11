# HOODYBOODY Chat Android

Owner chat app for Android. It connects to the store with Socket.IO and shows local phone notifications when customers write.

## Build APK

Install Java JDK and Android SDK first, then run:

```bash
npm install
npx cap add android
npm run build:apk
```

The debug APK will be created at:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

The app needs `CHAT_ADMIN_TOKEN` configured on the website server/Vercel. Enter the same token in the Android app settings.
