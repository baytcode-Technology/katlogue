# Meta WhatsApp Coexistence Setup (Katlogue)

## Permissions (no `business_management` required)

Embedded Signup uses only:

- `whatsapp_business_management` — WABA assets, webhook subscribe, phone lookup
- `whatsapp_business_messaging` — send/receive messages

**Do not request `business_management`.** WABA ID is resolved server-side via `debug_token` granular scopes after OAuth code exchange; phone number ID is fetched from the WABA via `GET /{waba-id}/phone_numbers`.

## Connect flow (mobile app) — custom Embedded Signup (NOT Hosted ES)

**Wrong path (what production was running before deploy):**
`business.facebook.com/messaging/whatsapp/onboard/` — this is **Hosted Embedded Signup**. It shows the "Onboard to WhatsApp Business Platform with …" landing page, completes on Meta's domain, and delivers results via `account_update` webhooks only. It **never** redirects to `redirect_uri` with an OAuth `code`, so `openAuthSessionAsync` always ends with `{ type: 'dismiss' }`.

**Correct path (current code, not yet deployed at time of investigation):**
1. Merchant taps **Connect WhatsApp** in the app.
2. `openAuthSessionAsync` opens `https://api.aishopy.io/api/whatsapp/oauth/launch` (same-origin), which **302 redirects** to `www.facebook.com/v20.0/dialog/oauth` with `config_id`, `response_type=code`, `override_default_response_type=true`, coexistence `extras`, and `redirect_uri=https://api.aishopy.io/api/whatsapp/oauth/callback`.
3. Merchant completes Embedded Signup in the OAuth dialog.
4. Meta redirects to the HTTPS callback with `?code=&state=`.
5. Backend **302 redirects** to `aishopyapp://whatsapp-oauth?code=&state=`.
6. App calls `POST /api/whatsapp/complete-onboarding`.
7. Backend exchanges code, resolves WABA via `debug_token`, stores credentials.

**Env vars** (no hardcoded Hosted ES URL — only `META_EMBEDDED_SIGNUP_CONFIG_ID`):
- `META_APP_ID`, `META_APP_SECRET`
- `META_EMBEDDED_SIGNUP_CONFIG_ID=1512657917023774`
- `META_OAUTH_REDIRECT_URI=https://api.aishopy.io/api/whatsapp/oauth/callback`

**Logging:** `[whatsapp][signup-url] classified` includes `urlType`. If you see `hosted-embedded-signup`, the wrong URL is being generated.

### Plan B — intentional Hosted ES (not implemented)

If `dialog/oauth` still fails on mobile, switch to Hosted ES on purpose:
- Subscribe to `account_update` → handle `PARTNER_ADDED`
- Exchange system token for business token server-side
- Map WABA to store; app polls `GET /connection-status`

Current webhook code parses `account_update` but does **not** onboard on `PARTNER_ADDED`.

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
