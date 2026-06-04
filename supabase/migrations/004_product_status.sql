-- Product catalog status: active (visible on storefront) | draft (hidden).

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS status text;

UPDATE public.products
SET status = CASE WHEN is_active THEN 'active' ELSE 'draft' END
WHERE status IS NULL;

ALTER TABLE public.products
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_status_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_status_check CHECK (status IN ('active', 'draft'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_store_status
  ON public.products (store_id, status);
