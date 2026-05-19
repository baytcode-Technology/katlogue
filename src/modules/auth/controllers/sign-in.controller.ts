import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import * as signInService from '../services/sign-in.service.js'
import type { SignInInput } from '../validations/auth.validation.js'

export const signIn = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body as SignInInput
  await signInService.sendSignInOtp({ email })

  res.status(200).json({
    success: true,
    message: 'OTP sent to your email',
    data: { email },
  })
})
