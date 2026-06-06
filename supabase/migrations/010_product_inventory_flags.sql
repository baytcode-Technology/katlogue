-- Product-level inventory flags for sold display and non-tracked catalog items
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS mark_as_sold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mark_as_non_inventory boolean NOT NULL DEFAULT false;
