CREATE TABLE IF NOT EXISTS public.subscription_checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'razorpay',
  provider_order_id text NOT NULL,
  provider_payment_id text,
  amount numeric(12, 2) NOT NULL,
  currency text NOT NULL,
  plan text NOT NULL DEFAULT 'business',
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  period_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscription_checkouts_status_check
    CHECK (status IN ('pending', 'paid', 'failed')),
  CONSTRAINT subscription_checkouts_plan_check
    CHECK (plan IN ('business', 'enterprise'))
);

CREATE UNIQUE INDEX IF NOT EXISTS subscription_checkouts_provider_order_id_idx
  ON public.subscription_checkouts (provider_order_id);

CREATE INDEX IF NOT EXISTS subscription_checkouts_store_id_idx
  ON public.subscription_checkouts (store_id);
