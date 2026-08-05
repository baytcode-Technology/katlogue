import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { recordEmbeddedSignupEvent } from '../services/embedded-signup-session.service.js'

/** Ingest WA_EMBEDDED_SIGNUP postMessage events from the SDK bridge page (state-validated, no auth). */
export const embeddedSignupEvent = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as { state?: string; event?: unknown }
  const state = String(body.state ?? '').trim()
  if (!state) {
    throw new AppError(400, 'state is required', 'ES_STATE_REQUIRED')
  }
  if (body.event == null) {
    throw new AppError(400, 'event payload is required', 'ES_EVENT_REQUIRED')
  }

  const session = recordEmbeddedSignupEvent({ state, payload: body.event })

  res.status(200).json({
    success: true,
    data: {
      storeId: session.storeId,
      eventCount: session.events.length,
      verifyOtpSeen: session.verifyOtpSeen,
      onboardingComplete: session.onboardingComplete,
      wabaId: session.wabaId,
      phoneNumberId: session.phoneNumberId,
    },
  })
})
