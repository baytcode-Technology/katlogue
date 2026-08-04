import axios from 'axios'
import { AppError } from '../../../shared/errors/app.error.js'
import type { WhatsAppCredentials } from './whatsapp.service.js'
import * as syncRepository from '../repositories/whatsapp-sync.repository.js'
import {
  fetchPhoneCoexistenceStatus,
  fetchWabaWebhookSubscription,
  inspectAccessToken,
  resolveWhatsAppWebhookCallbackUrl,
  subscribeWhatsAppWebhooksWithOverride,
} from './embedded-signup.service.js'

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

function isTokenAuthError(meta: MetaGraphError | null): boolean {
  return meta?.code === 190 || meta?.code === 102 || meta?.error_subcode === 463
}

function isAlreadySyncedError(meta: MetaGraphError | null): boolean {
  return meta?.code === 2593107 || meta?.error_subcode === 2593107
}

function buildSyncFailure(meta: MetaGraphError | null, syncType: SmbAppDataSyncType): AppError {
  if (isTokenAuthError(meta)) {
    return new AppError(
      401,
      'WhatsApp access token expired or invalid — tap Reconnect account in Connect WhatsApp',
      'WHATSAPP_TOKEN_EXPIRED'
    )
  }

  if (meta?.code === 135000) {
    const trace = meta.fbtrace_id ? ` fbtrace_id=${meta.fbtrace_id}` : ''
    return new AppError(
      400,
      `Meta rejected coexistence sync (135000). Reconnect WhatsApp, finish the verification step in WhatsApp Business app, then retry within 24h.${trace}`,
      'SMB_APP_DATA_FAILED'
    )
  }

  const parts = [
    meta?.message ?? 'Meta sync error',
    meta?.code != null ? `code=${meta.code}` : null,
    meta?.error_subcode != null ? `subcode=${meta.error_subcode}` : null,
    `sync_type=${syncType}`,
    meta?.fbtrace_id ? `fbtrace_id=${meta.fbtrace_id}` : null,
  ].filter(Boolean)

  return new AppError(400, parts.join(' | '), 'SMB_APP_DATA_FAILED')
}

export async function assertAccessTokenReadyForSync(accessToken: string): Promise<void> {  const inspection = await inspectAccessToken(accessToken)
  console.info('[coexistence] token inspection', {
    isValid: inspection.isValid,
    isExpired: inspection.isExpired,
    expiresAt: inspection.expiresAt,
    scopes: inspection.scopes,
    wabaIds: inspection.wabaIds,
    type: inspection.type,
  })

  if (!inspection.isValid) {
    throw new AppError(
      401,
      'WhatsApp access token expired or invalid — tap Reconnect account in Connect WhatsApp',
      'WHATSAPP_TOKEN_EXPIRED'
    )
  }
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

  await assertAccessTokenReadyForSync(input.credentials.accessToken)

  try {
    return await attempt()
  } catch (err) {
    const meta = parseMetaGraphError(err)
    if (meta) {
      console.error('[coexistence] smb_app_data meta error', {
        storeId: input.storeId,
        syncType: input.syncType,
        code: meta.code ?? null,
        subcode: meta.error_subcode ?? null,
        message: meta.message ?? null,
        fbtrace_id: meta.fbtrace_id ?? null,
      })
    }

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
        const retryMeta = parseMetaGraphError(retryErr)
        console.error('[coexistence] smb_app_data retry failed', {
          storeId: input.storeId,
          code: retryMeta?.code ?? null,
          fbtrace_id: retryMeta?.fbtrace_id ?? null,
        })
        throw buildSyncFailure(retryMeta, input.syncType)
      }
    }

    throw buildSyncFailure(meta, input.syncType)
  }
}

export async function runFullCoexistenceSync(input: {
  storeId: number
  credentials: WhatsAppCredentials
  initialDelayMs?: number
  wabaId?: string | null
}): Promise<{ contacts: string; history: string | null; historySkipped?: boolean }> {
  if (input.wabaId) {
    try {
      await subscribeWhatsAppWebhooksWithOverride({
        wabaId: input.wabaId,
        accessToken: input.credentials.accessToken,
      })
      const subscription = await fetchWabaWebhookSubscription({
        wabaId: input.wabaId,
        accessToken: input.credentials.accessToken,
      })
      console.info('[coexistence] pre-sync webhook state', {
        storeId: input.storeId,
        overrideCallbackUri: subscription.overrideCallbackUri,
        expectedCallback: resolveWhatsAppWebhookCallbackUrl(),
      })
    } catch (err) {
      console.warn('[coexistence] pre-sync webhook override failed', err)
    }
  }

  const phoneStatus = await fetchPhoneCoexistenceStatus({
    phoneNumberId: input.credentials.phoneNumberId,
    accessToken: input.credentials.accessToken,
  })
  console.info('[coexistence] pre-sync phone status', {
    storeId: input.storeId,
    ...phoneStatus,
  })

  if (!phoneStatus.isOnBizApp || phoneStatus.platformType !== 'CLOUD_API') {
    throw new AppError(
      400,
      'Phone number is not in coexistence mode (is_on_biz_app + CLOUD_API required for smb_app_data)',
      'COEXISTENCE_NOT_READY'
    )
  }

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
