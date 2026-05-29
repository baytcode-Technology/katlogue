-- Run this in Supabase SQL Editor (your DB already has core tables).
-- Do NOT run 001_whatsapp_integration.sql — it would conflict with existing tables.

-- ---------------------------------------------------------------------------
-- 1) whatsapp_conversations — columns + unique key required for upsert
-- ---------------------------------------------------------------------------
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unread_count integer NOT NULL DEFAULT 0;

-- Required for ON CONFLICT (store_id, customer_wa_number) in the backend.
-- If this fails, dedupe rows first:
--   SELECT store_id, customer_wa_number, COUNT(*) FROM whatsapp_conversations
--   GROUP BY 1,2 HAVING COUNT(*) > 1;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'whatsapp_conversations_store_customer_unique'
  ) THEN
    ALTER TABLE public.whatsapp_conversations
      ADD CONSTRAINT whatsapp_conversations_store_customer_unique
      UNIQUE (store_id, customer_wa_number);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_store_last
  ON public.whatsapp_conversations (store_id, last_message_at DESC NULLS LAST);

-- ---------------------------------------------------------------------------
-- 2) whatsapp_messages — delivery/read status for Meta webhooks
-- ---------------------------------------------------------------------------
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS status text;

UPDATE public.whatsapp_messages
SET status = CASE
  WHEN direction = 'inbound' THEN 'received'
  ELSE 'sent'
END
WHERE status IS NULL;

ALTER TABLE public.whatsapp_messages
  ALTER COLUMN status SET DEFAULT 'received';

-- Optional CHECK (skip if you prefer looser values)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_messages_status_check'
  ) THEN
    ALTER TABLE public.whatsapp_messages
      ADD CONSTRAINT whatsapp_messages_status_check
      CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed', 'received'));
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'whatsapp_messages_status_check skipped: %', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Webhook idempotency (prevents duplicate Meta retries)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  payload_hash text,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_processed_at
  ON public.whatsapp_webhook_events (processed_at DESC);

-- ---------------------------------------------------------------------------
-- 4) customers — unique per store (if missing)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_store_whatsapp_unique'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_store_whatsapp_unique UNIQUE (store_id, whatsapp_number);
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'customers_store_whatsapp_unique skipped (dedupe customers first): %', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- 5) Link Meta test number to your store (EDIT VALUES)
-- ---------------------------------------------------------------------------
-- UPDATE public.stores
-- SET
--   whatsapp_number = '919876543210',           -- digits only, no +
--   wa_phone_number_id = 'YOUR_META_PHONE_NUMBER_ID'
-- WHERE id = 'YOUR_STORE_UUID';

-- Optional: multi-number table (for future Embedded Signup)
-- INSERT INTO public.whatsapp_store_numbers (store_id, wa_phone_number_id, wa_business_account_id)
-- VALUES ('YOUR_STORE_UUID', 'YOUR_META_PHONE_NUMBER_ID', 'YOUR_WABA_ID')
-- ON CONFLICT (wa_phone_number_id) DO UPDATE SET store_id = EXCLUDED.store_id;
