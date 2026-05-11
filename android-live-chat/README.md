# HOODYBOODY Chat Android

Owner chat app for Android. It connects to the store chat and supports Firebase Cloud Messaging push notifications, so customer messages can notify the phone even when the app is closed.

## Push notifications

For closed-app/background push notifications, create a Firebase Android app with package:

```text
com.hoodyboody.livechat
```

Download `google-services.json` from Firebase and place it here:

```text
android/app/google-services.json
```

Add one of these to Vercel Production environment variables:

```text
FIREBASE_SERVICE_ACCOUNT_JSON
```

or:

```text
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
```

The service account must be allowed to send Firebase Cloud Messaging HTTP v1 messages.

The app creates a notification channel named `Customer messages`. Use the app button `Choose notification sound` to open Android notification settings and select any sound from the phone's sound library.

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

The app needs `CHAT_ADMIN_TOKEN` configured on the website server/Vercel. Enter the same token in the Android app settings, then tap `Enable notifications`.
