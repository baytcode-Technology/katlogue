-- Migration 013 dropped orders_order_number_unique, but some DBs still have
-- orders_order_number_key (global UNIQUE on order_number only). Remove it so
-- order numbers are unique per store via orders_store_id_order_number_unique.

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_order_number_unique;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_order_number_key;

DROP INDEX IF EXISTS public.orders_order_number_key;
