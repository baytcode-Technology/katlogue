-- Categories are identified by id; slug is not used on storefront.
ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_store_slug_unique;

ALTER TABLE public.categories
  DROP COLUMN IF EXISTS slug;
