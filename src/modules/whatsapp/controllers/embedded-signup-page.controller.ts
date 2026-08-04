import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { buildEmbeddedSignupBridgeHtml } from '../services/embedded-signup.service.js'

/** Serves FB SDK bridge page for Embedded Signup (opened via expo-web-browser auth session). */
export const embeddedSignupPage = asyncHandler(async (req: Request, res: Response) => {
  const state = typeof req.query.state === 'string' ? req.query.state.trim() : ''
  if (!state) {
    throw new AppError(400, 'Missing state query parameter', 'EMBEDDED_SIGNUP_MISSING_STATE')
  }

  console.info('[whatsapp][embedded-signup] bridge page served', {
    hasState: true,
    userAgent: req.get('user-agent')?.slice(0, 120) ?? null,
  })

  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' https://connect.facebook.net https://*.facebook.com https://*.fb.com data: blob:; " +
      "script-src 'self' 'unsafe-inline' https://connect.facebook.net; " +
      "frame-src https://*.facebook.com https://*.fb.com; connect-src 'self' https://*.facebook.com https://*.fb.com;"
  )

  res.status(200).type('html').send(buildEmbeddedSignupBridgeHtml({ state }))
})
