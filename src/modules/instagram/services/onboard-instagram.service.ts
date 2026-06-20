import { AppError } from '../../../shared/errors/app.error.js'
import { assertPremiumAccess } from '../../../shared/lib/subscription.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { ensureInstagramWebhookSubscription } from './instagram-api.service.js'
import {
  exchangeCodeForAccessToken,
  exchangeForLongLivedToken,
  fetchInstagramProfile,
  type InstagramTokenExchangeResult,
} from './instagram-oauth.service.js'

export type InstagramConnectionStatus = {
  connected: boolean
  ig_user_id: string | null
  ig_username: string | null
}

async function resolveLongLivedToken(
  token: InstagramTokenExchangeResult
): Promise<string> {
  try {
    const longLived = await exchangeForLongLivedToken(token.accessToken)
    return longLived.accessToken
  } catch {
    return token.accessToken
  }
}

export async function onboardInstagramStore(input: {
  storeId: number
  token: InstagramTokenExchangeResult
}) {
  const store = await storeRepository.findStoreById(input.storeId)
  if (!store) {
    throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  }

  assertPremiumAccess(store)

  const accessToken = await resolveLongLivedToken(input.token)
  const profile = await fetchInstagramProfile(accessToken)

  await storeRepository.updateInstagramConnection({
    storeId: input.storeId,
    igUserId: profile.userId,
    igUsername: profile.username,
    igAccessToken: accessToken,
  })

  const updatedStore = await storeRepository.findStoreById(input.storeId)
  if (updatedStore) {
    await ensureInstagramWebhookSubscription(updatedStore)
  }

  return {
    igUserId: profile.userId,
    igUsername: profile.username,
  }
}

export async function onboardInstagramFromCode(input: {
  storeId: number
  code: string
}) {
  const token = await exchangeCodeForAccessToken(input.code)
  return onboardInstagramStore({ storeId: input.storeId, token })
}

export async function getInstagramConnectionStatus(
  storeId: number
): Promise<InstagramConnectionStatus> {
  const store = await storeRepository.findStoreById(storeId)
  if (!store) {
    throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  }

  const connected = Boolean(store.ig_user_id && store.ig_access_token)

  if (connected) {
    try {
      await ensureInstagramWebhookSubscription(store)
    } catch (err) {
      console.error('[instagram] webhook subscription ensure failed on status check', err)
    }
  }

  return {
    connected,
    ig_user_id: store.ig_user_id,
    ig_username: store.ig_username,
  }
}
