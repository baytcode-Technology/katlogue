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
