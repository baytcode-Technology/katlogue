import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { buildEmbeddedSignupBridgeHtml } from '../services/embedded-signup.service.js'

/** Serves FB SDK bridge page on api.aishopy.io for mobile WebView Embedded Signup. */
export const embeddedSignupPage = asyncHandler(async (req: Request, res: Response) => {
  const state = typeof req.query.state === 'string' ? req.query.state : null

  console.info('[DEBUG-f85713][H6] embedded-signup bridge page served', {
    hasState: Boolean(state),
    userAgent: req.get('user-agent')?.slice(0, 120) ?? null,
  })

  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' https://connect.facebook.net https://*.facebook.com https://*.fb.com data: blob:; " +
      "script-src 'self' 'unsafe-inline' https://connect.facebook.net; " +
      "frame-src https://*.facebook.com https://*.fb.com; connect-src 'self' https://*.facebook.com https://*.fb.com;"
  )

  res.status(200).type('html').send(buildEmbeddedSignupBridgeHtml())
})
