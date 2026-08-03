import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'

/** Temporary debug ingest for WhatsApp connect flow (session f85713). */
export const whatsappDebugSession = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

  const body = req.body as {
    step?: string
    hypothesisId?: string
    sessionId?: string
    data?: unknown
    timestamp?: number
  }

  console.info('[DEBUG-f85713]', {
    hypothesisId: body.hypothesisId ?? null,
    step: body.step ?? 'unknown',
    sessionId: body.sessionId ?? null,
    userId: req.authUser.id,
    data: body.data ?? null,
    at: body.timestamp ?? Date.now(),
  })

  res.status(200).json({ success: true })
})
