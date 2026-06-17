-- subscription_plan: starter (free default) | business | enterprise
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS subscription_plan text NOT NULL DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS product_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.stores
  ADD CONSTRAINT stores_subscription_plan_check
  CHECK (subscription_plan IN ('starter', 'business', 'enterprise'));
