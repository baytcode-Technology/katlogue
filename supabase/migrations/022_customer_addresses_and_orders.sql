-- Multiple saved shipping addresses per customer + denormalized order id list.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS shipping_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS order_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

-- Backfill: move legacy single address into shipping_addresses when non-empty.
UPDATE public.customers
SET shipping_addresses = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'name', COALESCE(address->>'name', name),
    'phone_number', COALESCE(address->>'phone_number', address->>'whatsapp_number', whatsapp_number),
    'address', COALESCE(address->>'address', address->>'region', ''),
    'city', COALESCE(address->>'city', ''),
    'district', COALESCE(address->>'district', ''),
    'state', COALESCE(address->>'state', ''),
    'postcode', COALESCE(address->>'postcode', ''),
    'created_at', COALESCE(created_at, now())
  )
)
WHERE address IS NOT NULL
  AND address <> '{}'::jsonb
  AND (shipping_addresses IS NULL OR shipping_addresses = '[]'::jsonb);

-- Backfill order_ids from existing orders linked to customers.
UPDATE public.customers c
SET order_ids = sub.ids
FROM (
  SELECT customer_id, array_agg(id ORDER BY created_at) AS ids
  FROM public.orders
  WHERE customer_id IS NOT NULL
  GROUP BY customer_id
) sub
WHERE c.id = sub.customer_id
  AND (c.order_ids IS NULL OR c.order_ids = '{}'::uuid[]);
