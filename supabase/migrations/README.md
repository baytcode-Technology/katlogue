# Supabase migrations

Run these in the **Supabase SQL Editor** (or `supabase db push`) in numeric order.

## Fresh Supabase project (no `stores` table yet)

You hit `relation "stores" does not exist` because **001 assumes core tables already exist**.

Run in order:

| Order | File | Purpose |
|-------|------|---------|
| 1 | `000_core_schema.sql` | `stores`, catalog, orders, `whatsapp_store_numbers` |
| 2 | `001_whatsapp_integration.sql` | WhatsApp inbox tables + webhook dedupe |
| 3 | `003_whatsapp_sync_jobs.sql` | Coexistence sync job tracking |

**Do not run** `002_patch_existing_schema.sql` on a fresh project.

## Existing Katlogue database (already has `stores`, inbox tables)

| Order | File | Purpose |
|-------|------|---------|
| 1 | `002_patch_existing_schema.sql` | Patches conversations/messages + webhook dedupe |
| 2 | `003_whatsapp_sync_jobs.sql` | Sync jobs (requires `stores`) |

**Do not run** `000` or `001` if those tables already exist (you may get duplicate-object errors).

If `stores` exists but is missing WhatsApp columns, run only this block in the SQL editor:

```sql
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS wa_phone_number_id text,
  ADD COLUMN IF NOT EXISTS wa_waba_id text,
  ADD COLUMN IF NOT EXISTS wa_access_token text;
```

## What the backend uses

| Feature | Table |
|--------|--------|
| Merchant stores | `stores` |
| Chat list / thread API | `whatsapp_conversations`, `whatsapp_messages` |
| Customers on inbound | `customers` |
| Webhook dedupe | `whatsapp_webhook_events` |
| Coexistence sync | `whatsapp_sync_jobs` |
| Store routing | `stores.wa_phone_number_id`, `whatsapp_store_numbers` |
