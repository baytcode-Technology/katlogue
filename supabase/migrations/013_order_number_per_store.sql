-- Order numbers are unique per store (e.g. FEB-1 can exist in multiple stores).
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_order_number_unique;

CREATE UNIQUE INDEX IF NOT EXISTS orders_store_id_order_number_unique
  ON public.orders (store_id, order_number);
