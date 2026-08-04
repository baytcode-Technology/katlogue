import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { env } from '../../../config/env.js'
import { buildEmbeddedSignupDialogUrl } from '../services/embedded-signup.service.js'
import { logSignupUrlClassification } from '../services/signup-url-classifier.js'

/** Start OAuth from api.aishopy.io (allowed domain) → 302 to Meta dialog/oauth. */
export const metaOAuthLaunch = asyncHandler(async (req: Request, res: Response) => {
  const state = typeof req.query.state === 'string' ? req.query.state.trim() : ''
  if (!state) {
    throw new AppError(400, 'state query parameter is required', 'OAUTH_LAUNCH_MISSING_STATE')
  }

  if (!env.META.EMBEDDED_SIGNUP_CONFIG_ID) {
    throw new AppError(503, 'Embedded Signup is not configured', 'META_ES_NOT_CONFIGURED')
  }

  const metaUrl = buildEmbeddedSignupDialogUrl({ state })
  const metaUrlType = logSignupUrlClassification({
    context: 'oauthLaunch:metaRedirect',
    url: metaUrl,
  })

  console.info('[whatsapp][oauth-launch] redirecting to Meta OAuth dialog', {
    hasState: true,
    stateLength: state.length,
    metaUrlType,
    redirectUri: env.META.OAUTH_REDIRECT_URI ?? null,
  })

  res.redirect(302, metaUrl)
})
