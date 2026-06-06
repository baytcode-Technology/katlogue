-- Split orders.status + lifecycle timestamps into three status enums.

DO $$ BEGIN
  CREATE TYPE public.order_lifecycle_status AS ENUM (
    'pending',
    'confirmed',
    'completed',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.order_payment_status AS ENUM (
    'pending',
    'confirming',
    'partially_paid',
    'paid',
    'refunded'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.order_fulfillment_status AS ENUM (
    'unfulfilled',
    'ready',
    'in_transit',
    'out_for_delivery',
    'fulfilled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add new columns (nullable during backfill)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_status public.order_lifecycle_status,
  ADD COLUMN IF NOT EXISTS payment_status public.order_payment_status,
  ADD COLUMN IF NOT EXISTS fulfillment_status public.order_fulfillment_status;

-- Backfill from legacy status column (text or enum)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'status'
  ) THEN
    UPDATE public.orders o
    SET
      order_status = CASE o.status::text
        WHEN 'cancelled' THEN 'cancelled'::public.order_lifecycle_status
        WHEN 'refunded' THEN 'cancelled'::public.order_lifecycle_status
        WHEN 'delivered' THEN 'completed'::public.order_lifecycle_status
        WHEN 'confirmed' THEN 'confirmed'::public.order_lifecycle_status
        WHEN 'paid' THEN 'confirmed'::public.order_lifecycle_status
        WHEN 'packed' THEN 'confirmed'::public.order_lifecycle_status
        WHEN 'shipped' THEN 'confirmed'::public.order_lifecycle_status
        ELSE 'pending'::public.order_lifecycle_status
      END,
      payment_status = CASE o.status::text
        WHEN 'paid' THEN 'paid'::public.order_payment_status
        WHEN 'refunded' THEN 'refunded'::public.order_payment_status
        WHEN 'shipped' THEN 'paid'::public.order_payment_status
        WHEN 'delivered' THEN 'paid'::public.order_payment_status
        WHEN 'pending_payment' THEN 'pending'::public.order_payment_status
        ELSE 'pending'::public.order_payment_status
      END,
      fulfillment_status = CASE o.status::text
        WHEN 'delivered' THEN 'fulfilled'::public.order_fulfillment_status
        WHEN 'shipped' THEN 'in_transit'::public.order_fulfillment_status
        WHEN 'packed' THEN 'ready'::public.order_fulfillment_status
        ELSE 'unfulfilled'::public.order_fulfillment_status
      END
    WHERE o.order_status IS NULL
       OR o.payment_status IS NULL
       OR o.fulfillment_status IS NULL;
  END IF;
END $$;

-- Defaults for any rows still null
UPDATE public.orders
SET
  order_status = COALESCE(order_status, 'pending'::public.order_lifecycle_status),
  payment_status = COALESCE(payment_status, 'pending'::public.order_payment_status),
  fulfillment_status = COALESCE(fulfillment_status, 'unfulfilled'::public.order_fulfillment_status)
WHERE order_status IS NULL
   OR payment_status IS NULL
   OR fulfillment_status IS NULL;

ALTER TABLE public.orders
  ALTER COLUMN order_status SET DEFAULT 'pending'::public.order_lifecycle_status,
  ALTER COLUMN order_status SET NOT NULL,
  ALTER COLUMN payment_status SET DEFAULT 'pending'::public.order_payment_status,
  ALTER COLUMN payment_status SET NOT NULL,
  ALTER COLUMN fulfillment_status SET DEFAULT 'unfulfilled'::public.order_fulfillment_status,
  ALTER COLUMN fulfillment_status SET NOT NULL;

-- Drop legacy lifecycle columns
ALTER TABLE public.orders
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS paid_at,
  DROP COLUMN IF EXISTS confirmed_at,
  DROP COLUMN IF EXISTS shipped_at,
  DROP COLUMN IF EXISTS delivered_at,
  DROP COLUMN IF EXISTS cancelled_at;

CREATE INDEX IF NOT EXISTS idx_orders_store_order_status
  ON public.orders (store_id, order_status);
