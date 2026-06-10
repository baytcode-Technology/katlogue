import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { onboardInstagramFromCode } from '../services/onboard-instagram.service.js'

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

export const instagramOAuthCallback = asyncHandler(async (req: Request, res: Response) => {
  const code = String(req.query.code ?? '').trim()
  const stateRaw = typeof req.query.state === 'string' ? req.query.state : undefined
  const error = typeof req.query.error === 'string' ? req.query.error : undefined

  if (error) {
    res.status(400).send(`Instagram connection failed: ${error}`)
    return
  }

  if (!code) throw new AppError(400, 'Missing code', 'INSTAGRAM_OAUTH_BAD_REQUEST')

  const state = parseState(stateRaw)
  if (!state) throw new AppError(400, 'Invalid state', 'INSTAGRAM_OAUTH_BAD_STATE')

  const result = await onboardInstagramFromCode({ storeId: state.storeId, code })

  const deepLink = process.env.MOBILE_DEEP_LINK_URL?.trim()
  if (deepLink) {
    const qs = new URLSearchParams({
      connected: result.igUserId ? '1' : '0',
      channel: 'instagram',
    }).toString()
    res.redirect(`${deepLink}?${qs}`)
    return
  }

  const handle = result.igUsername ? `@${result.igUsername}` : result.igUserId
  res.status(200).send(
    `Instagram connected successfully as ${handle}. You can close this window and return to the app.`
  )
})
