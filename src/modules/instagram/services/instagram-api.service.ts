import axios from 'axios'
import { env } from '../../../config/env.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type { Store } from '../../stores/types/store.types.js'

export function isInstagramReadyForStore(store: Store): boolean {
  return Boolean(store.ig_user_id && store.ig_access_token)
}

export function resolveStoreInstagramCredentials(store: Store): {
  igUserId: string
  accessToken: string
} | null {
  if (!store.ig_user_id || !store.ig_access_token) return null
  return {
    igUserId: store.ig_user_id,
    accessToken: store.ig_access_token,
  }
}

function formatMetaAxiosError(err: unknown): string {
  if (!axios.isAxiosError(err) || !err.response?.data) {
    return err instanceof Error ? err.message : 'unknown error'
  }
  const data = err.response.data as { error?: { message?: string } }
  return data.error?.message ?? JSON.stringify(err.response.data)
}

/** Subscribe the connected IG account to webhook fields (required for DM delivery). */
export async function subscribeInstagramWebhooks(input: {
  igUserId: string
  accessToken: string
}): Promise<void> {
  const version = env.INSTAGRAM.API_VERSION
  const params = {
    subscribed_fields: 'messages',
    access_token: input.accessToken,
  }

  const urls = [
    `https://graph.instagram.com/${version}/me/subscribed_apps`,
    `https://graph.instagram.com/${version}/${input.igUserId}/subscribed_apps`,
  ]

  let lastError: string | null = null

  for (const url of urls) {
    try {
      const { data } = await axios.post<{ success?: boolean }>(url, null, {
        params,
        timeout: 15_000,
      })

      if (data.success !== false) {
        console.info('[instagram] subscribed_apps ok url=%s igUserId=%s', url, input.igUserId)
        return
      }

      lastError = JSON.stringify(data)
    } catch (err) {
      lastError = formatMetaAxiosError(err)
      console.warn('[instagram] subscribed_apps attempt failed url=%s %s', url, lastError)
    }
  }

  throw new AppError(
    502,
    lastError ?? 'Failed to subscribe Instagram account to message webhooks',
    'INSTAGRAM_WEBHOOK_SUBSCRIBE_FAILED'
  )
}

export async function ensureInstagramWebhookSubscription(store: Store): Promise<void> {
  const credentials = resolveStoreInstagramCredentials(store)
  if (!credentials) return
  await subscribeInstagramWebhooks(credentials)
}

export async function sendInstagramTextMessage(input: {
  igUserId: string
  accessToken: string
  recipientIgId: string
  message: string
}): Promise<{ metaMessageId: string; raw: unknown }> {
  const url = `https://graph.instagram.com/${env.INSTAGRAM.API_VERSION}/${input.igUserId}/messages`

  try {
    const { data } = await axios.post<{
      message_id?: string
      recipient_id?: string
    }>(
      url,
      {
        recipient: { id: input.recipientIgId },
        message: { text: input.message },
      },
      {
        params: { access_token: input.accessToken },
        timeout: 15_000,
      }
    )

    const metaMessageId = data.message_id?.trim()
    if (!metaMessageId) {
      throw new AppError(502, 'Instagram did not return a message id', 'INSTAGRAM_SEND_FAILED')
    }

    return { metaMessageId, raw: data }
  } catch (err) {
    if (err instanceof AppError) throw err
    const message =
      axios.isAxiosError(err) && err.response?.data
        ? JSON.stringify(err.response.data)
        : 'Failed to send Instagram message'
    throw new AppError(400, message, 'INSTAGRAM_SEND_FAILED')
  }
}

export async function sendInstagramAttachmentMessage(input: {
  igUserId: string
  accessToken: string
  recipientIgId: string
  type: 'image' | 'audio' | 'video' | 'file'
  url: string
}): Promise<{ metaMessageId: string; raw: unknown }> {
  const apiUrl = `https://graph.instagram.com/${env.INSTAGRAM.API_VERSION}/${input.igUserId}/messages`

  try {
    const { data } = await axios.post<{
      message_id?: string
      recipient_id?: string
    }>(
      apiUrl,
      {
        recipient: { id: input.recipientIgId },
        message: {
          attachment: {
            type: input.type,
            payload: {
              url: input.url,
            },
          },
        },
      },
      {
        params: { access_token: input.accessToken },
        timeout: 60_000,
      }
    )

    const metaMessageId = data.message_id?.trim()
    if (!metaMessageId) {
      throw new AppError(502, 'Instagram did not return a message id', 'INSTAGRAM_SEND_FAILED')
    }

    return { metaMessageId, raw: data }
  } catch (err) {
    if (err instanceof AppError) throw err
    const message =
      axios.isAxiosError(err) && err.response?.data
        ? JSON.stringify(err.response.data)
        : 'Failed to send Instagram media message'
    throw new AppError(400, message, 'INSTAGRAM_SEND_FAILED')
  }
}
