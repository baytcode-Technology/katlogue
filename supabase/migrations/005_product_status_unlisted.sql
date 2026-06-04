-- Add unlisted to product catalog status.

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_status_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_status_check
  CHECK (status IN ('active', 'draft', 'unlisted'));
