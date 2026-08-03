import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'

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
  const error = typeof req.query.error === 'string' ? req.query.error : undefined

  if (error) {
    res.status(400).send(`WhatsApp connection failed: ${error}`)
    return
  }

  res.status(200).type('html').send(RETURN_HTML)
})
