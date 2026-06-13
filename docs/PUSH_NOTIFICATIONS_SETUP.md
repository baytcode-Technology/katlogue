# Push notifications setup (merchant app)

The AiShopy merchant app uses **Expo Push Notifications** for alerts when the app is closed or in the background.

## What gets notified

| Event | Toggle | Push title | Push body |
|-------|--------|------------|-----------|
| WhatsApp inbound message | `chats` | WhatsApp | `{phone}: {message}` |
| Instagram inbound DM | `chats` | Instagram | `{@user}: {message}` |
| Storefront order | `online_orders` | `{store.slug}` | `New online order · {order_number} · {total}` |
| POS / offline order | `pos_orders` | `{store.slug}` | `POS order · {order_number} · {total}` |

Preferences are stored on the store (`stores.notification_preferences`) so the backend can respect toggles when sending push from webhooks.

## API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/stores/me/notification-preferences` | Load toggles + sound |
| PATCH | `/api/stores/me/notification-preferences` | Save toggles + sound |
| PUT | `/api/stores/me/push-token` | Register device Expo push token |

### PATCH body example

```json
{
  "chats": true,
  "online_orders": true,
  "pos_orders": false,
  "sound_id": "chime"
}
```

### Push token body example

```json
{
  "expo_push_token": "ExponentPushToken[xxxx]",
  "platform": "android",
  "sound_channel_id": "aishopy-chime"
}
```

## Database

Run migration `021_notification_preferences.sql`:

- `stores.notification_preferences` JSONB
- `store_push_tokens` table (one row per device token)

## Android (FCM) — required for killed-app push

1. Create a Firebase project and add an Android app with package `com.aishopy.app`.
2. Download `google-services.json`.
3. Upload FCM credentials to EAS:
   ```bash
   cd aiShopy-app
   eas credentials
   ```
4. Rebuild the APK after adding the `expo-notifications` plugin:
   ```bash
   npm run build:apk
   ```
   Or use EAS Build for a development/preview build with FCM configured.

5. On Android 13+, the app requests `POST_NOTIFICATIONS` at runtime when opening **Settings → Notifications**.

## iOS (APNs)

Configure push credentials in EAS when testing on a physical iPhone. Simulator does not receive remote push.

## Sound IDs

Bundled preset sounds (also used for Android notification channels):

`default`, `chime`, `bell`, `ping`, `alert`, `soft`, `bright`, `pulse`

Custom upload is reserved for a future release.

## Push payload `data` (tap to open)

**Chat**

```json
{
  "type": "chat",
  "channel": "whatsapp",
  "conversationId": "uuid",
  "storeSlug": "my-shop"
}
```

**Order**

```json
{
  "type": "order",
  "orderId": "uuid",
  "orderNumber": "MAY26-1",
  "source": "storefront",
  "storeSlug": "my-shop"
}
```

The app deep-links to `/(store)/chats/[id]` or `/(store)/orders/[id]` when the user taps a notification.

## Real-time while app is open

Socket.IO events (same store room):

- `whatsapp:message:new`
- `instagram:message:new`
- `order:new`

The app also schedules a **local notification** with the selected sound when these fire and the matching toggle is enabled.

## Troubleshooting

| Issue | Check |
|-------|--------|
| No push when app closed | FCM/APNs configured? Token registered via PUT `/push-token`? |
| No sound | Open Notifications settings once to create Android channels |
| Toggle ignored when closed | PATCH preferences saved? Backend reads `notification_preferences` before send |
| Works on Wi‑Fi only in dev | Release APK with cloud API URL in `.env` |
