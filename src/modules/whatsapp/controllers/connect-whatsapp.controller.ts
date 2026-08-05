import type { Request, Response } from 'express'
import crypto from 'crypto'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { env } from '../../../config/env.js'
import { assertPremiumAccess } from '../../../shared/lib/subscription.js'
import {
  buildEmbeddedSignupPageUrl,
  buildMetaOAuthUrl,
  WHATSAPP_APP_AUTH_REDIRECT_URI,
} from '../services/embedded-signup.service.js'
import { ensureEmbeddedSignupSession } from '../services/embedded-signup-session.service.js'
import { parseStoreIdFromQuery } from '../../../shared/utils/parse-store-id.js'
import {
  classifyWhatsAppSignupUrl,
  describeSignupUrlType,
  logSignupUrlClassification,
} from '../services/signup-url-classifier.js'

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

  const nonce = crypto.randomBytes(12).toString('hex')
  const state = buildState({ storeId, nonce })

  const apiBaseUrl =
    env.API_PUBLIC_URL?.replace(/\/$/, '') ??
    `${req.protocol}://${req.get('host') ?? 'localhost'}`

  const url = env.META.EMBEDDED_SIGNUP_CONFIG_ID
    ? buildEmbeddedSignupPageUrl({ state, apiBaseUrl })
    : buildMetaOAuthUrl({ state })

  if (env.META.EMBEDDED_SIGNUP_CONFIG_ID) {
    ensureEmbeddedSignupSession(state, storeId, nonce)
  }

  const launchUrlType = classifyWhatsAppSignupUrl(url)

  logSignupUrlClassification({
    context: 'connectWhatsApp:launchUrl',
    url,
    extra: { storeId },
  })

  if (launchUrlType === 'hosted-embedded-signup') {
    throw new AppError(
      500,
      'WhatsApp connect URL misconfigured: Hosted Embedded Signup path cannot return OAuth codes',
      'HOSTED_ES_URL_BLOCKED'
    )
  }

  console.info('[whatsapp][connect] generated signup URL', {
    storeId,
    signupFlow: env.META.EMBEDDED_SIGNUP_CONFIG_ID
      ? 'embedded-signup-sdk-bridge'
      : 'oauth-dialog',
    launchUrlType,
    launchUrlDescription: describeSignupUrlType(launchUrlType),
    redirectUri: env.META.OAUTH_REDIRECT_URI ?? null,
    appRedirectUri: WHATSAPP_APP_AUTH_REDIRECT_URI,
    hasConfigId: Boolean(env.META.EMBEDDED_SIGNUP_CONFIG_ID),
    urlHost: (() => {
      try {
        return new URL(url).hostname
      } catch {
        return 'invalid'
      }
    })(),
  })

  res.status(200).json({
    success: true,
    message: 'Meta connect URL generated',
    data: {
      url,
      redirectUri: WHATSAPP_APP_AUTH_REDIRECT_URI,
      oauthRedirectUri: env.META.OAUTH_REDIRECT_URI ?? null,
      signupUrlType: launchUrlType,
      metaDialogUrlType: null,
    },
  })
})
