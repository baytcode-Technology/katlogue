import type { Request, Response } from 'express'
import crypto from 'crypto'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { env } from '../../../config/env.js'
import { assertPremiumAccess } from '../../../shared/lib/subscription.js'
import { buildEmbeddedSignupBridgeUrl, buildMetaOAuthUrl } from '../services/embedded-signup.service.js'
import { parseStoreIdFromQuery } from '../../../shared/utils/parse-store-id.js'

function buildState(payload: object): string {
  const json = JSON.stringify(payload)
  return Buffer.from(json, 'utf8').toString('base64url')
}

export const connectWhatsApp = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

  const storeId = parseStoreIdFromQuery(req.query.store_id ?? req.query.storeId)

  await storeRepository.assertStoreOwner(storeId, req.authUser.id)

  const store = await storeRepository.findStoreById(storeId)
  if (!store) throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  assertPremiumAccess(store)

  // State: small, signed-in-context and store-scoped
  const nonce = crypto.randomBytes(12).toString('hex')
  const state = buildState({ storeId, nonce })

  const url = env.META.EMBEDDED_SIGNUP_CONFIG_ID
    ? buildEmbeddedSignupBridgeUrl({ state })
    : buildMetaOAuthUrl({ state })

  console.info('[whatsapp][connect] generated signup URL', {
    storeId,
    signupFlow: env.META.EMBEDDED_SIGNUP_CONFIG_ID ? 'sdk-auth-session' : 'oauth-dialog',
    redirectUri: env.META.OAUTH_REDIRECT_URI ?? null,
    hasConfigId: Boolean(env.META.EMBEDDED_SIGNUP_CONFIG_ID),
    urlHost: (() => {
      try {
        return new URL(url).hostname
      } catch {
        return 'invalid'
      }
    })(),
    signupParams: (() => {
      try {
        const u = new URL(url)
        return {
          redirect_uri: u.searchParams.get('redirect_uri'),
          override_default_response_type: u.searchParams.get('override_default_response_type'),
          response_type: u.searchParams.get('response_type'),
        }
      } catch {
        return null
      }
    })(),
  })

  res.status(200).json({
    success: true,
    message: 'Meta connect URL generated',
    data: {
      url,
      redirectUri: 'aishopyapp://whatsapp-oauth',
      oauthRedirectUri: env.META.OAUTH_REDIRECT_URI ?? null,
    },
  })
})

