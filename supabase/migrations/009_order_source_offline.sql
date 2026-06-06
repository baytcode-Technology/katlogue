-- Walk-in / merchant POS orders without a customer use source = 'offline'
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_source') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'order_source' AND e.enumlabel = 'offline'
    ) THEN
      ALTER TYPE public.order_source ADD VALUE 'offline';
    END IF;
  END IF;
END $$;
