-- Allow orders without a linked customer (offline / walk-in orders)
ALTER TABLE public.orders
  ALTER COLUMN customer_id DROP NOT NULL;

-- Every line item must reference a product
ALTER TABLE public.order_items
  ALTER COLUMN product_id SET NOT NULL;
