import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import * as verifyOtpService from '../services/verify-otp.service.js'
import type { VerifyOtpInput } from '../validations/auth.validation.js'

export const verifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as VerifyOtpInput
  const result = await verifyOtpService.verifySignInOtp(input)

  res.status(200).json({
    success: true,
    message: result.user.isNewUser ? 'Account created successfully' : 'Signed in successfully',
    data: result,
  })
})
