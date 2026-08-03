import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { env } from '../../../config/env.js'

function maskCode(code: string | undefined): string | null {
  if (!code) return null
  return code.length <= 8 ? '***' : `${code.slice(0, 8)}…(${code.length})`
}

const RETURN_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AiShopy — WhatsApp</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        margin: 0;
        background: #f8fafc;
        color: #334155;
        text-align: center;
        padding: 24px;
      }
      .card {
        max-width: 360px;
        background: #fff;
        border-radius: 12px;
        padding: 32px 24px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      }
      h1 { font-size: 20px; margin: 0 0 12px; color: #0f172a; }
      p { margin: 0; line-height: 1.5; font-size: 15px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Return to AiShopy</h1>
      <p>WhatsApp authorization is complete. Close this window and return to the AiShopy app to finish connecting.</p>
    </div>
  </body>
</html>`

/** OAuth redirect target — mobile app intercepts this URL and completes onboarding via API. */
export const metaOAuthCallback = asyncHandler(async (req: Request, res: Response) => {
  const code = typeof req.query.code === 'string' ? req.query.code : undefined
  const state = typeof req.query.state === 'string' ? req.query.state : undefined
  const error = typeof req.query.error === 'string' ? req.query.error : undefined

  console.info('[whatsapp][oauth-callback] HIT', {
    path: req.path,
    hasCode: Boolean(code),
    code: maskCode(code),
    hasState: Boolean(state),
    error: error ?? null,
    configuredRedirectUri: env.META.OAUTH_REDIRECT_URI ?? null,
    userAgent: req.get('user-agent')?.slice(0, 120) ?? null,
    queryKeys: Object.keys(req.query),
  })

  if (error) {
    console.warn('[whatsapp][oauth-callback] error from Meta', { error })
    res.status(400).send(`WhatsApp connection failed: ${error}`)
    return
  }

  if (!code) {
    console.warn('[whatsapp][oauth-callback] no code in query — app must complete via API')
  } else {
    console.info('[whatsapp][oauth-callback] code present — mobile WebView should intercept this')
  }

  res.status(200).type('html').send(RETURN_HTML)
})
