# Firebase Push Setup for HOODYBOODY Chat

This app already has Firebase Cloud Messaging support in the Android app and in the website backend. Closed-app notifications will work only after both the APK and Vercel are connected to the same Firebase project.

## 1. Create Firebase project

1. Open Firebase Console.
2. Create a project, for example `hoodyboody-chat`.
3. Open Project settings.
4. Add an Android app.
5. Use this Android package name exactly:

```text
com.hoodyboody.livechat
```

6. Download `google-services.json`.
7. Put the file here:

```text
android-live-chat/android/app/google-services.json
```

Do not commit this file. It is ignored by `.gitignore`.

## 2. Rebuild APK

Run from the `android-live-chat` folder:

```powershell
npm run build:apk
```

The APK is created here:

```text
android-live-chat/android/app/build/outputs/apk/debug/app-debug.apk
```

Copy it to the public download file:

```powershell
Copy-Item "android/app/build/outputs/apk/debug/app-debug.apk" "../dist/hoodyboody-live-chat-debug.apk" -Force
```

Then deploy the website so the new APK is downloadable from:

```text
https://www.hoodyboody.com/dist/hoodyboody-live-chat-debug.apk
```

## 3. Create Firebase service account for Vercel

1. In Firebase Console open Project settings.
2. Open Service accounts.
3. Generate a new private key.
4. Download the JSON file.

The server uses Firebase Cloud Messaging HTTP v1. Add the service account JSON to Vercel as one production environment variable:

```text
FIREBASE_SERVICE_ACCOUNT_JSON
```

Recommended value format: paste the full JSON as one line, or paste base64-encoded JSON.

Alternative split variables:

```text
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
```

If using `FIREBASE_PRIVATE_KEY`, keep newline escapes as `\n`.

## 4. Redeploy Vercel

After adding the environment variable, redeploy production:

```powershell
npx vercel --prod --yes
```

## 5. Install and register phone

1. Delete the old HOODYBOODY Chat app from the phone.
2. Install the new APK.
3. Open the app.
4. Enter:

```text
Site URL: https://www.hoodyboody.com
Admin token: CHAT_ADMIN_TOKEN
```

5. Tap `Connect`.
6. Tap `Enable notifications`.
7. Allow notifications.
8. Tap `Test push`.

## 6. Verify server status

Use the admin token and open:

```text
GET /api/admin/chat/push-status
```

Expected:

```json
{
  "configured": true,
  "tokens": [
    {
      "platform": "android",
      "enabled": true
    }
  ]
}
```

If `configured` is false, Vercel does not have Firebase service account env variables yet.

If `tokens` is empty, the phone did not register. Open the app, tap `Enable notifications`, and allow notifications in Android settings.

