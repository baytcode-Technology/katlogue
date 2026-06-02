-- Coexistence sync job tracking (Meta smb_app_data requests)
CREATE TABLE IF NOT EXISTS public.whatsapp_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  sync_type text NOT NULL CHECK (sync_type IN ('smb_app_state_sync', 'history')),
  request_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'declined')),
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sync_jobs_store
  ON public.whatsapp_sync_jobs (store_id, started_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_sync_jobs_store_type_active
  ON public.whatsapp_sync_jobs (store_id, sync_type)
  WHERE status IN ('pending', 'in_progress');
