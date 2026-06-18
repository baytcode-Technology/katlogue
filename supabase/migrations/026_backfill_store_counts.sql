-- Ensure subscription columns exist (safe if 024 was not applied yet)
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS subscription_plan text,
  ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS product_count integer,
  ADD COLUMN IF NOT EXISTS order_count integer;

UPDATE public.stores
SET subscription_plan = 'starter'
WHERE subscription_plan IS NULL;

UPDATE public.stores
SET product_count = 0
WHERE product_count IS NULL;

UPDATE public.stores
SET order_count = 0
WHERE order_count IS NULL;

ALTER TABLE public.stores
  ALTER COLUMN subscription_plan SET DEFAULT 'starter',
  ALTER COLUMN subscription_plan SET NOT NULL,
  ALTER COLUMN product_count SET DEFAULT 0,
  ALTER COLUMN product_count SET NOT NULL,
  ALTER COLUMN order_count SET DEFAULT 0,
  ALTER COLUMN order_count SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE public.stores
    ADD CONSTRAINT stores_subscription_plan_check
    CHECK (subscription_plan IN ('starter', 'business', 'enterprise'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Backfill counts from existing products and orders
UPDATE public.stores s
SET product_count = (
  SELECT COUNT(*)::integer FROM public.products p WHERE p.store_id = s.id
);

UPDATE public.stores s
SET order_count = (
  SELECT COUNT(*)::integer FROM public.orders o WHERE o.store_id = s.id
);
