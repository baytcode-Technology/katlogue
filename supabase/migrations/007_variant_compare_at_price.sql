-- Variant-level compare-at (original) price for sale display
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS compare_at_price numeric(12, 2);
