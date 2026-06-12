-- Add required country to stores (existing rows default to India)
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS country text;

UPDATE public.stores
SET country = 'India'
WHERE country IS NULL;

ALTER TABLE public.stores
  ALTER COLUMN country SET DEFAULT 'India',
  ALTER COLUMN country SET NOT NULL;
