-- Optional category description for storefront / admin detail
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS description text;
