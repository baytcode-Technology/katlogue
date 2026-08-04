import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { env } from '../../../config/env.js'
import { WHATSAPP_APP_AUTH_REDIRECT_URI } from '../services/embedded-signup.service.js'

function maskCode(code: string | undefined): string | null {
  if (!code) return null
  return code.length <= 8 ? '***' : `${code.slice(0, 8)}…(${code.length})`
}

function buildAppRedirect(query: Record<string, string>): string {
  const params = new URLSearchParams(query)
  return `${WHATSAPP_APP_AUTH_REDIRECT_URI}?${params.toString()}`
}

/** Meta OAuth redirect — 302 to app deep link so openAuthSessionAsync can complete. */
export const metaOAuthCallback = asyncHandler(async (req: Request, res: Response) => {
  const code = typeof req.query.code === 'string' ? req.query.code : undefined
  const state = typeof req.query.state === 'string' ? req.query.state : undefined
  const error =
    typeof req.query.error === 'string'
      ? req.query.error
      : typeof req.query.error_reason === 'string'
        ? req.query.error_reason
        : undefined

  console.info('[whatsapp][oauth-callback] HIT', {
    path: req.path,
    hasCode: Boolean(code),
    code: maskCode(code),
    hasState: Boolean(state),
    error: error ?? null,
    configuredRedirectUri: env.META.OAUTH_REDIRECT_URI ?? null,
    appRedirectUri: WHATSAPP_APP_AUTH_REDIRECT_URI,
    userAgent: req.get('user-agent')?.slice(0, 120) ?? null,
    queryKeys: Object.keys(req.query),
  })

  if (error) {
    console.warn('[whatsapp][oauth-callback] error from Meta — redirecting to app', { error })
    res.redirect(302, buildAppRedirect({ error }))
    return
  }

  if (!code) {
    console.warn('[whatsapp][oauth-callback] missing code — redirecting to app with error')
    res.redirect(302, buildAppRedirect({ error: 'missing_code' }))
    return
  }

  const redirectQuery: Record<string, string> = { code }
  if (state) redirectQuery.state = state

  const appUrl = buildAppRedirect(redirectQuery)
  console.info('[whatsapp][oauth-callback] redirecting to app', {
    hasCode: true,
    hasState: Boolean(state),
    appUrlPrefix: WHATSAPP_APP_AUTH_REDIRECT_URI,
  })

  res.redirect(302, appUrl)
})
