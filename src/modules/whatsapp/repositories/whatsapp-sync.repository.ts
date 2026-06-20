import { supabaseAdmin } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'

export type SyncJobType = 'smb_app_state_sync' | 'history'
export type SyncJobStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'declined'

export type WhatsAppSyncJob = {
  id: string
  store_id: number
  sync_type: SyncJobType
  request_id: string | null
  status: SyncJobStatus
  error_message: string | null
  started_at: string
  completed_at: string | null
}

export async function createSyncJob(input: {
  storeId: number
  syncType: SyncJobType
  requestId: string | null
}): Promise<WhatsAppSyncJob> {
  const { data, error } = await supabaseAdmin
    .from('whatsapp_sync_jobs')
    .insert({
      store_id: input.storeId,
      sync_type: input.syncType,
      request_id: input.requestId,
      status: 'in_progress',
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new AppError(409, 'Sync already in progress for this store', 'SYNC_IN_PROGRESS')
    }
    throw new AppError(400, error.message, 'SYNC_JOB_CREATE_FAILED')
  }

  return data as WhatsAppSyncJob
}

export async function updateSyncJob(input: {
  id: string
  status: SyncJobStatus
  errorMessage?: string | null
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from('whatsapp_sync_jobs')
    .update({
      status: input.status,
      error_message: input.errorMessage ?? null,
      completed_at: ['completed', 'failed', 'declined'].includes(input.status)
        ? new Date().toISOString()
        : null,
    })
    .eq('id', input.id)

  if (error) {
    throw new AppError(400, error.message, 'SYNC_JOB_UPDATE_FAILED')
  }
}

export async function listSyncJobs(storeId: number): Promise<WhatsAppSyncJob[]> {
  const { data, error } = await supabaseAdmin
    .from('whatsapp_sync_jobs')
    .select('*')
    .eq('store_id', storeId)
    .order('started_at', { ascending: false })
    .limit(10)

  if (error) {
    throw new AppError(400, error.message, 'SYNC_JOBS_FETCH_FAILED')
  }

  return (data as WhatsAppSyncJob[]) ?? []
}

export async function findActiveSyncJob(
  storeId: number,
  syncType: SyncJobType
): Promise<WhatsAppSyncJob | null> {
  const { data, error } = await supabaseAdmin
    .from('whatsapp_sync_jobs')
    .select('*')
    .eq('store_id', storeId)
    .eq('sync_type', syncType)
    .in('status', ['pending', 'in_progress'])
    .maybeSingle()

  if (error) {
    throw new AppError(400, error.message, 'SYNC_JOB_LOOKUP_FAILED')
  }

  return (data as WhatsAppSyncJob) ?? null
}
