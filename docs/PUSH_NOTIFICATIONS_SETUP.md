# Push notifications — alerts when app is closed

AiShopy uses **Expo Push + Firebase (FCM)** on Android so chats and orders show in the **notification bar** with your **phone’s default notification sound**, even when the app is fully closed.

## How alerts work today

| App state | What you get |
|-----------|----------------|
| **Open** | In-app toast at the top (no custom ringtone) |
| **Background** (minimized) | System notification + default sound (if socket still connected) |
| **Closed / killed** | **Requires FCM setup below** — server push via Expo |

The **Notification sound** picker in Settings is **coming soon**. All alerts use the system default tone for now.

---

## One-time Android setup (required for closed-app push)

### Step 1 — Firebase project

1. Open [Firebase Console](https://console.firebase.google.com/)
2. Create a project (or use an existing one)
3. **Add Android app**
   - Package name: `com.aishopy.app` (must match exactly)
4. Download **`google-services.json`**

### Step 2 — Add file to the app

Copy the file here:

```
aiShopy-app/google-services.json
```

`app.json` already points to this path (`android.googleServicesFile`).

### Step 3 — Upload FCM key to Expo

Expo’s push service needs your Firebase credentials:

```bash
cd aiShopy-app
npx eas-cli login
npx eas credentials
```

- Select **Android** → **production** (or development)
- Choose **Google Service Account** / **FCM V1**
- Follow prompts to upload the Firebase service account JSON

Guide: [Expo FCM credentials](https://docs.expo.dev/push-notifications/fcm-credentials/)

### Step 4 — Rebuild the native app

`npm run android` alone is not enough after adding Firebase — rebuild native code:

**Option A — local dev (`npm run android`):**

```bash
cd aiShopy-app
npx expo prebuild --platform android --clean
npm run android
```

**Option B — release APK (recommended for testing push):**

```bash
npm run build:apk
```

Install the new APK on your phone.

### Step 5 — Register on the device

1. Open the app → **Settings → Notifications**
2. Allow notification permission when prompted
3. Toggle **Chats** / **POS orders** ON

The app registers an Expo push token with your backend. Without FCM, you will see in logs:

```
[push] Expo push token unavailable (FCM not configured)
```

After setup, that warning should disappear.

### Step 6 — Test

1. Open app once (to register token)
2. **Force-close** the app (swipe away from recents)
3. Send a WhatsApp message to your store **or** create a storefront order
4. You should see a notification: **WhatsApp** / **{store-slug}** with message or order details

---

## Notification toggles (Settings)

| Toggle | Fires when |
|--------|------------|
| **Chats** | Inbound WhatsApp or Instagram DM |
| **Online orders** | New order from storefront (`source: storefront`) |
| **POS orders** | Walk-in order from app (`source: offline`) |

Preferences are saved on the server so webhooks can send push when the app is closed.

---

## API (reference)

| Method | Path |
|--------|------|
| GET/PATCH | `/api/stores/me/notification-preferences` |
| PUT | `/api/stores/me/push-token` |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `FirebaseApp is not initialized` | Add `google-services.json` + rebuild native app |
| `Expo push token unavailable` | Complete Step 3 (FCM key on Expo) + rebuild |
| No alert when app open | Expected — toast only; not suppressed on chat **list**, only inside that chat thread |
| No alert when app closed | Token not registered — open app once; check toggles; verify backend has row in `store_push_tokens` |
| Toggle saved but no push | PATCH preferences on server; redeploy backend if needed |

---

## Database migrations

Ensure these ran on Supabase:

- `020_order_checkout_token.sql`
- `021_notification_preferences.sql` (`notification_preferences` + `store_push_tokens`)
