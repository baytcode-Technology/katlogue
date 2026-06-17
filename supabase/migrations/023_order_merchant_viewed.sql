ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS merchant_viewed_at timestamptz;

UPDATE orders
SET merchant_viewed_at = created_at
WHERE merchant_viewed_at IS NULL;
