import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { exchangeCodeForAccessToken } from '../services/embedded-signup.service.js'
import { onboardCoexistenceStore } from '../services/onboard-coexistence.service.js'

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

export const metaOAuthCallback = asyncHandler(async (req: Request, res: Response) => {
  const code = String(req.query.code ?? '').trim()
  const stateRaw = typeof req.query.state === 'string' ? req.query.state : undefined
  const error = typeof req.query.error === 'string' ? req.query.error : undefined

  if (error) {
    res.status(400).send(`WhatsApp connection failed: ${error}`)
    return
  }

  if (!code) throw new AppError(400, 'Missing code', 'META_OAUTH_BAD_REQUEST')

  const state = parseState(stateRaw)
  if (!state) throw new AppError(400, 'Invalid state', 'META_OAUTH_BAD_STATE')

  const token = await exchangeCodeForAccessToken(code)
  const result = await onboardCoexistenceStore({ storeId: state.storeId, token })

  const deepLink = process.env.MOBILE_DEEP_LINK_URL?.trim()
  if (deepLink) {
    const qs = new URLSearchParams({
      connected: result.phoneNumberId ? '1' : '0',
      sync: result.syncTriggered ? '1' : '0',
    }).toString()
    res.redirect(`${deepLink}?${qs}`)
    return
  }

  res.status(200).send(
    `WhatsApp connected successfully.${result.syncTriggered ? ' Contact and history sync started — this may take up to 24 hours.' : ''} You can close this window and return to the app.`
  )
})
