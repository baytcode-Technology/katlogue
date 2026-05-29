# Supabase migrations

## You already have tables

If your project matches the Katlogue schema (`stores`, `customers`, `conversations`, `messages`, `whatsapp_conversations`, `whatsapp_messages`, `whatsapp_store_numbers`):

1. **Run only** `002_patch_existing_schema.sql` in the Supabase SQL Editor.
2. **Do not run** `001_whatsapp_integration.sql` (it tries to `CREATE TABLE` that already exist).

## What the backend uses today

| Feature | Table |
|--------|--------|
| Chat list / thread API | `whatsapp_conversations`, `whatsapp_messages` |
| Customers on inbound | `customers` |
| Webhook dedupe | `whatsapp_webhook_events` (created by 002) |
| Store routing | `stores.wa_phone_number_id` or `stores.whatsapp_number`, then `whatsapp_store_numbers` |

## Canonical tables (future)

`conversations` + `messages` are your long-term model (orders link via `conversation_id`). The WhatsApp module does not write there yet; you can add dual-write later without breaking the app.
