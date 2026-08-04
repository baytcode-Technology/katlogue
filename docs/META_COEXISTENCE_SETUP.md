# Meta WhatsApp Coexistence Setup (Katlogue)

## Permissions (no `business_management` required)

Embedded Signup uses only:

- `whatsapp_business_management` — WABA assets, webhook subscribe, phone lookup
- `whatsapp_business_messaging` — send/receive messages

**Do not request `business_management`.** WABA and phone IDs come from Meta's `WA_EMBEDDED_SIGNUP` session event in the mobile app WebView, not from `GET /me/businesses`.

## Connect flow (mobile app)

1. Merchant taps **Connect WhatsApp** in the app.
2. App opens `expo-web-browser` auth session (Custom Tabs / ASWebAuthenticationSession) to the FB SDK bridge page on `api.aishopy.io`.
3. Bridge page calls `FB.login()` with Embedded Signup v4 extras (`whatsapp_business_app_onboarding`).
4. Bridge page saves `waba_id` via `POST /api/whatsapp/embedded-signup/session` when `WA_EMBEDDED_SIGNUP` fires.
5. Meta redirects to `/api/whatsapp/oauth/callback?code=...&state=...`; auth session returns that URL to the app.
6. App calls `POST /api/whatsapp/complete-onboarding` with `{ storeId, code, state }`; backend resolves `wabaId` from session store.
7. Backend exchanges code, subscribes webhooks, stores credentials.

Do **not** navigate directly to `business.facebook.com/messaging/whatsapp/onboard/` — that bypasses the FB SDK `window.opener` handshake and lands on Hosted ES OAuth Callback without delivering results.

---

## Partner path: Option A — Tech Provider (selected)

| Step | Action | Status |
|------|--------|--------|
| 1 | Meta Business Suite — register business | Done |
| 2 | Business verification | **In review** |
| 3 | Tech Provider onboarding (App Dashboard → WhatsApp → Tech Provider onboarding) | After verification |
| 4 | Embedded Signup Builder — Configuration ID with `whatsapp_business_app_onboarding` | After TP approval |
| 5 | Connect real WhatsApp Business App number (coexistence) | After Embedded Signup |
| 6 | Trigger `smb_app_data` sync within 24h | Automatic via Katlogue backend |

**Timeline:** Business verification typically 3–14 days. Tech Provider review adds 1–4 weeks.

---

## Meta Dashboard checklist (Phase 0)

### Webhook URL
```
https://YOUR-APP.up.railway.app/webhook
```
Alternative: `https://YOUR-APP.up.railway.app/api/webhooks/whatsapp`

### Subscribe webhook fields (WhatsApp → Configuration)

| Field | Required for |
|-------|--------------|
| `messages` | Inbound customer messages |
| `message_status` or `statuses` | Delivery/read ticks |
| `history` | Past chat import (coexistence) |
| `smb_app_state_sync` | Contact sync (coexistence) |
| `smb_message_echoes` | Phone app replies mirrored (coexistence) |
| `account_update` | Disconnect / partner removed (optional) |

### Railway env vars

```env
# Existing
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Coexistence / Embedded Signup
META_APP_ID=
META_APP_SECRET=
META_EMBEDDED_SIGNUP_CONFIG_ID=
META_OAUTH_REDIRECT_URI=https://YOUR-APP.up.railway.app/api/whatsapp/oauth/callback
API_PUBLIC_URL=https://YOUR-APP.up.railway.app
```

---

## E2E testing checklist (after Tech Provider approval)

**Local parser validation (no Meta access required):**
```bash
cd backend && npm run test:whatsapp-parsers
```
Sample payloads live in `backend/src/modules/whatsapp/fixtures/`.

| # | Test | Expected |
|---|------|----------|
| 1 | Embedded Signup shows "Connect WhatsApp Business App" | Coexistence path visible |
| 2 | Complete connect from Katlogue app → Settings → Connect WhatsApp | `POST /api/whatsapp/complete-onboarding` stores token + phone IDs |
| 3 | `GET /api/whatsapp/connection-status` | `is_on_biz_app: true`, sync jobs listed |
| 4 | Contacts appear in `customers` table | From `smb_app_state_sync` webhooks |
| 5 | Past messages in `whatsapp_messages` | From `history` webhooks (if merchant opted in) |
| 6 | Send from phone WhatsApp Business app | Appears in Katlogue inbox via `smb_message_echoes` |
| 7 | Reply from Katlogue app | Customer receives on WhatsApp |
| 8 | Merchant disconnects in Business app | `account_update` webhook; status reflects disconnected |

---

## Merchant-facing copy

- Keep WhatsApp Business app installed (v2.24.17+)
- Open Business app during initial sync
- Sync may take up to 24 hours
- Up to 6 months of 1:1 chats if you opt in during connect; groups not included
