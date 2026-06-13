ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT '{
    "chats": true,
    "online_orders": true,
    "pos_orders": true,
    "sound_id": "default"
  }'::jsonb;

CREATE TABLE IF NOT EXISTS store_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  expo_push_token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  sound_channel_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (expo_push_token)
);

CREATE INDEX IF NOT EXISTS idx_store_push_tokens_store_id ON store_push_tokens(store_id);
