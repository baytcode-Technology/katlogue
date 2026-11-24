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

function isMobileClient(userAgent: string | undefined): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent ?? '')
}

/** Desktop browsers cannot open aishopyapp://, so return to the website callback page. */
function buildReturnUrl(userAgent: string | undefined, query: Record<string, string>): string {
  if (isMobileClient(userAgent)) return buildAppRedirect(query)
  const base = env.WEB_APP_URL.replace(/\/$/, '')
  const params = new URLSearchParams(query)
  return `${base}/whatsapp-oauth?${params.toString()}`
}

/** Meta OAuth redirect — phone deep link, or the website on a desktop browser. */
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

  const userAgent = req.get('user-agent')
  const returnPrefix = isMobileClient(userAgent)
    ? WHATSAPP_APP_AUTH_REDIRECT_URI
    : `${env.WEB_APP_URL.replace(/\/$/, '')}/whatsapp-oauth`

  if (error) {
    console.warn('[whatsapp][oauth-callback] error from Meta — redirecting', { error, returnPrefix })
    res.redirect(302, buildReturnUrl(userAgent, { error }))
    return
  }

  if (!code) {
    console.warn('[whatsapp][oauth-callback] missing code — redirecting with error', { returnPrefix })
    res.redirect(302, buildReturnUrl(userAgent, { error: 'missing_code' }))
    return
  }

  const redirectQuery: Record<string, string> = { code }
  if (state) redirectQuery.state = state

  console.info('[whatsapp][oauth-callback] redirecting', {
    hasCode: true,
    hasState: Boolean(state),
    returnPrefix,
  })

  res.redirect(302, buildReturnUrl(userAgent, redirectQuery))
})
