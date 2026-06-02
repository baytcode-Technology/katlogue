import axios from 'axios'
import { env } from '../../../config/env.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type { WhatsAppCredentials } from './whatsapp.service.js'
import * as syncRepository from '../repositories/whatsapp-sync.repository.js'

export type SmbAppDataSyncType = 'smb_app_state_sync' | 'history'

export async function triggerSmbAppDataSync(input: {
  storeId: string
  syncType: SmbAppDataSyncType
  credentials: WhatsAppCredentials
}): Promise<{ requestId: string; jobId: string }> {
  const existing = await syncRepository.findActiveSyncJob(input.storeId, input.syncType)
  if (existing) {
    throw new AppError(409, 'Sync already in progress', 'SYNC_IN_PROGRESS')
  }

  try {
    const { data } = await axios.post<{ request_id?: string }>(
      `https://graph.facebook.com/${input.credentials.apiVersion}/${input.credentials.phoneNumberId}/smb_app_data`,
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

    return { requestId: requestId ?? job.id, jobId: job.id }
  } catch (err) {
    if (err instanceof AppError) throw err
    if (axios.isAxiosError(err)) {
      const message =
        (err.response?.data as { error?: { message?: string } })?.error?.message ??
        'Failed to trigger sync'
      throw new AppError(400, message, 'SMB_APP_DATA_FAILED')
    }
    throw new AppError(500, 'Failed to trigger sync', 'SMB_APP_DATA_FAILED')
  }
}

export async function runFullCoexistenceSync(input: {
  storeId: string
  credentials: WhatsAppCredentials
}): Promise<{ contacts: string; history: string }> {
  const contacts = await triggerSmbAppDataSync({
    storeId: input.storeId,
    syncType: 'smb_app_state_sync',
    credentials: input.credentials,
  })

  const history = await triggerSmbAppDataSync({
    storeId: input.storeId,
    syncType: 'history',
    credentials: input.credentials,
  })

  return { contacts: contacts.requestId, history: history.requestId }
}

export async function markHistorySyncDeclined(storeId: string): Promise<void> {
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
