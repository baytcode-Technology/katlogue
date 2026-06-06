ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS mark_as_sold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mark_as_non_inventory boolean NOT NULL DEFAULT false;
