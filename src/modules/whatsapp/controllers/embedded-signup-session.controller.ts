import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { saveEmbeddedSignupSession } from '../services/embedded-signup-session.service.js'

/** Stores WA_EMBEDDED_SIGNUP assets from the FB SDK bridge page (keyed by OAuth state). */
export const saveEmbeddedSignupSessionAssets = asyncHandler(
  async (req: Request, res: Response) => {
    const state = typeof req.body?.state === 'string' ? req.body.state.trim() : ''
    const wabaId =
      typeof req.body?.wabaId === 'string'
        ? req.body.wabaId.trim()
        : typeof req.body?.waba_id === 'string'
          ? req.body.waba_id.trim()
          : ''
    const phoneNumberId =
      typeof req.body?.phoneNumberId === 'string'
        ? req.body.phoneNumberId.trim()
        : typeof req.body?.phone_number_id === 'string'
          ? req.body.phone_number_id.trim()
          : null

    if (!state) {
      throw new AppError(400, 'state is required', 'EMBEDDED_SIGNUP_SESSION_INVALID')
    }
    if (!wabaId) {
      throw new AppError(400, 'wabaId is required', 'EMBEDDED_SIGNUP_SESSION_INVALID')
    }

    saveEmbeddedSignupSession({ state, wabaId, phoneNumberId })

    console.info('[whatsapp][embedded-signup-session] saved', {
      hasState: true,
      wabaId,
      phoneNumberId: phoneNumberId ?? null,
    })

    res.status(200).json({ success: true, message: 'Embedded Signup session saved' })
  }
)
