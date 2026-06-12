-- Checkout token for public order status polling (storefront after payment)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS checkout_token text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_checkout_token
  ON public.orders (checkout_token)
  WHERE checkout_token IS NOT NULL;
