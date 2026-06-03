import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import * as googleExchangeCodeService from '../services/google-exchange-code.service.js'
import type { GoogleCodeExchangeInput } from '../validations/auth.validation.js'

export const googleExchangeCode = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as GoogleCodeExchangeInput
  const result = await googleExchangeCodeService.signInWithGoogleAuthCode(input)

  res.status(200).json({
    success: true,
    message: result.user.isNewUser ? 'Account created successfully' : 'Signed in successfully',
    data: result,
  })
})
