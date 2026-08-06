import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { onboardInstagramFromCode } from '../services/onboard-instagram.service.js'
import { buildInstagramAppRedirect } from '../services/instagram-app-redirect.service.js'

function parseState(state: string | undefined): { storeId: number } | null {
  if (!state) return null
  try {
    const json = Buffer.from(state, 'base64url').toString('utf8')
    const data = JSON.parse(json) as { storeId?: string }
    if (!data.storeId) return null
    return { storeId: Number(data.storeId) }
  } catch {
    return null
  }
}

export const instagramOAuthCallback = asyncHandler(async (req: Request, res: Response) => {
  const code = String(req.query.code ?? '').trim()
  const stateRaw = typeof req.query.state === 'string' ? req.query.state : undefined
  const error = typeof req.query.error === 'string' ? req.query.error : undefined

  if (error) {
    res.redirect(
      302,
      buildInstagramAppRedirect({
        connected: '0',
        channel: 'instagram',
        error,
      })
    )
    return
  }

  if (!code) throw new AppError(400, 'Missing code', 'INSTAGRAM_OAUTH_BAD_REQUEST')

  const state = parseState(stateRaw)
  if (!state) throw new AppError(400, 'Invalid state', 'INSTAGRAM_OAUTH_BAD_STATE')

  const result = await onboardInstagramFromCode({ storeId: state.storeId, code })

  const redirectParams: Record<string, string> = {
    connected: result.igUserId ? '1' : '0',
    channel: 'instagram',
  }
  if (result.igUsername) {
    redirectParams.username = result.igUsername
  }

  res.redirect(302, buildInstagramAppRedirect(redirectParams))
})
