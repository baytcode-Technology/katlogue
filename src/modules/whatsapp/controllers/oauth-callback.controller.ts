import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { exchangeCodeForAccessToken } from '../services/embedded-signup.service.js'

function parseState(state: string | undefined): { storeId: string } | null {
  if (!state) return null
  try {
    const json = Buffer.from(state, 'base64url').toString('utf8')
    const data = JSON.parse(json) as { storeId?: string }
    if (!data.storeId) return null
    return { storeId: String(data.storeId) }
  } catch {
    return null
  }
}

/**
 * OAuth callback scaffolding.
 *
 * Notes:
 * - In full Embedded Signup (coexistence), Meta also sends session events and asset IDs.
 * - This controller only exchanges the OAuth code and persists an access token per store.
 * - After TP approval, we will extend this to capture phone_number_id, waba_id and trigger smb_app_data sync.
 */
export const metaOAuthCallback = asyncHandler(async (req: Request, res: Response) => {
  const code = String(req.query.code ?? '').trim()
  const stateRaw = typeof req.query.state === 'string' ? req.query.state : undefined

  if (!code) throw new AppError(400, 'Missing code', 'META_OAUTH_BAD_REQUEST')

  const state = parseState(stateRaw)
  if (!state) throw new AppError(400, 'Invalid state', 'META_OAUTH_BAD_STATE')

  const token = await exchangeCodeForAccessToken(code)

  // Store the token now. phone_number_id and waba_id will be populated in later phases.
  await storeRepository.updateWhatsAppConnection({
    storeId: state.storeId,
    waPhoneNumberId: null,
    waWabaId: null,
    waAccessToken: token.accessToken,
  })

  // Redirect back to app (deep link later). For now, show a simple success response.
  res.status(200).send('WhatsApp connected. You can close this window and return to the app.')
})

