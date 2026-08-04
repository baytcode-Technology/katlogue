import axios from 'axios'
import { AppError } from '../../../shared/errors/app.error.js'
import type { WhatsAppCredentials } from './whatsapp.service.js'
import * as syncRepository from '../repositories/whatsapp-sync.repository.js'

export type SmbAppDataSyncType = 'smb_app_state_sync' | 'history'

type MetaGraphError = {
  message?: string
  code?: number
  error_subcode?: number
  error_user_msg?: string
  fbtrace_id?: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseMetaGraphError(err: unknown): MetaGraphError | null {
  if (!axios.isAxiosError(err)) return null
  const data = err.response?.data as { error?: MetaGraphError } | undefined
  return data?.error ?? null
}

function formatMetaSyncError(err: unknown, syncType: SmbAppDataSyncType): string {
  const meta = parseMetaGraphError(err)
  if (!meta) {
    return err instanceof Error ? err.message : 'Failed to trigger sync'
  }

  const parts = [
    meta.message ?? 'Meta sync error',
    meta.code != null ? `code=${meta.code}` : null,
    meta.error_subcode != null ? `subcode=${meta.error_subcode}` : null,
    `sync_type=${syncType}`,
    meta.fbtrace_id ? `fbtrace_id=${meta.fbtrace_id}` : null,
  ].filter(Boolean)

  return parts.join(' | ')
}

function isAlreadySyncedError(meta: MetaGraphError | null): boolean {
  return meta?.code === 2593107 || meta?.error_subcode === 2593107
}

export async function triggerSmbAppDataSync(input: {
  storeId: number
  syncType: SmbAppDataSyncType
  credentials: WhatsAppCredentials
  allowRetry?: boolean
}): Promise<{ requestId: string; jobId: string; alreadySynced?: boolean }> {
  const existing = await syncRepository.findActiveSyncJob(input.storeId, input.syncType)
  if (existing) {
    throw new AppError(409, 'Sync already in progress', 'SYNC_IN_PROGRESS')
  }

  const completed = await syncRepository.listSyncJobs(input.storeId)
  const prior = completed.find(
    (j) => j.sync_type === input.syncType && ['completed', 'in_progress'].includes(j.status)
  )
  if (prior) {
    console.info('[coexistence] sync skipped — already triggered', {
      storeId: input.storeId,
      syncType: input.syncType,
      jobId: prior.id,
      status: prior.status,
    })
    return {
      requestId: prior.request_id ?? prior.id,
      jobId: prior.id,
      alreadySynced: true,
    }
  }

  const attempt = async (): Promise<{ requestId: string; jobId: string }> => {
    const url = `https://graph.facebook.com/${input.credentials.apiVersion}/${input.credentials.phoneNumberId}/smb_app_data`

    console.info('[coexistence] smb_app_data request', {
      storeId: input.storeId,
      syncType: input.syncType,
      phoneNumberId: input.credentials.phoneNumberId,
      apiVersion: input.credentials.apiVersion,
    })

    const { data } = await axios.post<{ request_id?: string; messaging_product?: string }>(
      url,
      {
        messaging_product: 'whatsapp',
        sync_type: input.syncType,
      },
      {
        headers: {
          Authorization: `Bearer ${input.credentials.accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 30_000,
      }
    )

    const requestId = data.request_id?.trim() ?? null
    const job = await syncRepository.createSyncJob({
      storeId: input.storeId,
      syncType: input.syncType,
      requestId,
    })

    console.info('[coexistence] smb_app_data accepted', {
      storeId: input.storeId,
      syncType: input.syncType,
      requestId,
      jobId: job.id,
    })

    return { requestId: requestId ?? job.id, jobId: job.id }
  }

  try {
    return await attempt()
  } catch (err) {
    const meta = parseMetaGraphError(err)
    if (isAlreadySyncedError(meta)) {
      console.warn('[coexistence] smb_app_data already synced at Meta', {
        storeId: input.storeId,
        syncType: input.syncType,
      })
      const job = await syncRepository.createSyncJob({
        storeId: input.storeId,
        syncType: input.syncType,
        requestId: null,
      })
      await syncRepository.updateSyncJob({ id: job.id, status: 'completed' })
      return { requestId: job.id, jobId: job.id, alreadySynced: true }
    }

    if (input.allowRetry !== false && meta?.code === 135000) {
      console.warn('[coexistence] smb_app_data 135000 — retrying after delay', {
        storeId: input.storeId,
        syncType: input.syncType,
        fbtrace_id: meta.fbtrace_id ?? null,
      })
      await sleep(8_000)
      try {
        return await attempt()
      } catch (retryErr) {
        const message = formatMetaSyncError(retryErr, input.syncType)
        console.error('[coexistence] smb_app_data retry failed', { storeId: input.storeId, message })
        throw new AppError(400, message, 'SMB_APP_DATA_FAILED')
      }
    }

    const message = formatMetaSyncError(err, input.syncType)
    console.error('[coexistence] smb_app_data failed', {
      storeId: input.storeId,
      syncType: input.syncType,
      message,
    })
    throw new AppError(400, message, 'SMB_APP_DATA_FAILED')
  }
}

export async function runFullCoexistenceSync(input: {
  storeId: number
  credentials: WhatsAppCredentials
  initialDelayMs?: number
}): Promise<{ contacts: string; history: string | null; historySkipped?: boolean }> {
  if (input.initialDelayMs && input.initialDelayMs > 0) {
    await sleep(input.initialDelayMs)
  }

  const contacts = await triggerSmbAppDataSync({
    storeId: input.storeId,
    syncType: 'smb_app_state_sync',
    credentials: input.credentials,
  })

  // Meta recommends contacts before history; allow propagation time.
  await sleep(5_000)

  try {
    const history = await triggerSmbAppDataSync({
      storeId: input.storeId,
      syncType: 'history',
      credentials: input.credentials,
    })
    return { contacts: contacts.requestId, history: history.requestId }
  } catch (err) {
    if (err instanceof AppError) {
      console.warn('[coexistence] history sync failed after contacts OK', {
        storeId: input.storeId,
        message: err.message,
      })
      return {
        contacts: contacts.requestId,
        history: null,
        historySkipped: true,
      }
    }
    throw err
  }
}

export async function markHistorySyncDeclined(storeId: number): Promise<void> {
  const jobs = await syncRepository.listSyncJobs(storeId)
  const historyJob = jobs.find((j) => j.sync_type === 'history' && j.status === 'in_progress')
  if (historyJob) {
    await syncRepository.updateSyncJob({
      id: historyJob.id,
      status: 'declined',
      errorMessage: 'Merchant declined history sharing (Meta error 2593109)',
    })
  }
}
