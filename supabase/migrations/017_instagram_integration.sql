-- Instagram Business Login + DM integration

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS ig_user_id text,
  ADD COLUMN IF NOT EXISTS ig_username text,
  ADD COLUMN IF NOT EXISTS ig_access_token text;

CREATE INDEX IF NOT EXISTS idx_stores_ig_user_id
  ON public.stores (ig_user_id)
  WHERE ig_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.instagram_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_ig_id text NOT NULL,
  customer_ig_username text,
  last_message_at timestamptz,
  last_message_preview text,
  unread_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT instagram_conversations_store_customer_unique
    UNIQUE (store_id, customer_ig_id)
);

CREATE INDEX IF NOT EXISTS idx_instagram_conversations_store_id
  ON public.instagram_conversations (store_id);

CREATE INDEX IF NOT EXISTS idx_instagram_conversations_last_message_at
  ON public.instagram_conversations (store_id, last_message_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS public.instagram_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.instagram_conversations(id) ON DELETE CASCADE,
  meta_message_id text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_ig_id text NOT NULL,
  to_ig_id text NOT NULL,
  type text NOT NULL DEFAULT 'text',
  text_body text,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed', 'received')),
  raw_payload jsonb,
  timestamp timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT instagram_messages_meta_message_id_unique UNIQUE (meta_message_id)
);

CREATE INDEX IF NOT EXISTS idx_instagram_messages_conversation
  ON public.instagram_messages (conversation_id, timestamp DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_instagram_messages_store
  ON public.instagram_messages (store_id, timestamp DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS public.instagram_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  payload_hash text,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instagram_webhook_events_processed_at
  ON public.instagram_webhook_events (processed_at DESC);
