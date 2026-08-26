import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import * as appleSignInService from '../services/apple-sign-in.service.js'
import type { AppleSignInInput } from '../validations/auth.validation.js'

export const appleSignIn = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as AppleSignInInput
  const result = await appleSignInService.signInWithApple(input)

  res.status(200).json({
    success: true,
    message: result.user.isNewUser ? 'Account created successfully' : 'Signed in successfully',
    data: result,
  })
})
