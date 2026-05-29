-- WhatsApp Cloud API integration schema (multi-tenant SaaS)
-- Run in Supabase SQL editor or via CLI.

-- ---------------------------------------------------------------------------
-- stores (WhatsApp credential columns — may already exist)
-- ---------------------------------------------------------------------------
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS wa_phone_number_id text,
  ADD COLUMN IF NOT EXISTS wa_waba_id text,
  ADD COLUMN IF NOT EXISTS wa_access_token text;

CREATE INDEX IF NOT EXISTS idx_stores_wa_phone_number_id
  ON stores (wa_phone_number_id)
  WHERE wa_phone_number_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stores_whatsapp_number
  ON stores (whatsapp_number);

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  whatsapp_number text NOT NULL,
  name text,
  email text,
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags text[] NOT NULL DEFAULT '{}',
  notes text,
  total_orders integer NOT NULL DEFAULT 0,
  total_spent numeric(12, 2) NOT NULL DEFAULT 0,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_store_whatsapp_unique UNIQUE (store_id, whatsapp_number)
);

CREATE INDEX IF NOT EXISTS idx_customers_store_id ON customers (store_id);
CREATE INDEX IF NOT EXISTS idx_customers_whatsapp_number ON customers (whatsapp_number);

-- ---------------------------------------------------------------------------
-- whatsapp_conversations (conversations)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  wa_phone_number_id text NOT NULL,
  customer_wa_number text NOT NULL,
  last_message_at timestamptz,
  last_message_preview text,
  unread_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_conversations_store_customer_unique
    UNIQUE (store_id, customer_wa_number)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_store_id
  ON whatsapp_conversations (store_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_last_message_at
  ON whatsapp_conversations (store_id, last_message_at DESC NULLS LAST);

-- ---------------------------------------------------------------------------
-- whatsapp_messages (messages)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  meta_message_id text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_number text NOT NULL,
  to_number text NOT NULL,
  type text NOT NULL DEFAULT 'text',
  text_body text,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed', 'received')),
  raw_payload jsonb,
  timestamp timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_messages_meta_message_id_unique UNIQUE (meta_message_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation
  ON whatsapp_messages (conversation_id, timestamp DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_store
  ON whatsapp_messages (store_id, timestamp DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_meta_id
  ON whatsapp_messages (meta_message_id);

-- Add columns when tables already exist from a prior deploy
ALTER TABLE whatsapp_conversations
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unread_count integer NOT NULL DEFAULT 0;

ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'received';

-- ---------------------------------------------------------------------------
-- webhook idempotency (prevent duplicate Meta event processing)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  payload_hash text,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_processed_at
  ON whatsapp_webhook_events (processed_at DESC);
