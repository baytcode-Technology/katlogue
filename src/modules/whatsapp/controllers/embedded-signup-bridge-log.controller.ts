import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { parseEmbeddedSignupState } from '../services/embedded-signup-session.service.js'

/** Bridge-page debug ingest (state-validated, no auth — mirrors debug-session log format). */
export const embeddedSignupBridgeLog = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as {
    state?: string
    step?: string
    data?: unknown
    timestamp?: number
  }

  const state = String(body.state ?? '').trim()
  if (!state) {
    throw new AppError(400, 'state is required', 'ES_STATE_REQUIRED')
  }

  const parsed = parseEmbeddedSignupState(state)
  if (!parsed) {
    throw new AppError(400, 'Invalid embedded signup state', 'ES_INVALID_STATE')
  }

  console.info('[DEBUG-f85713]', {
    hypothesisId: 'bridge-postMessage',
    step: body.step ?? 'unknown',
    sessionId: parsed.nonce,
    storeId: parsed.storeId,
    data: body.data ?? null,
    at: body.timestamp ?? Date.now(),
  })

  res.status(200).json({ success: true })
})
