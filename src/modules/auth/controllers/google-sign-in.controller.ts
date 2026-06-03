import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import * as googleSignInService from '../services/google-sign-in.service.js'
import type { GoogleSignInInput } from '../validations/auth.validation.js'

export const googleSignIn = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as GoogleSignInInput
  const result = await googleSignInService.signInWithGoogle(input)

  res.status(200).json({
    success: true,
    message: result.user.isNewUser ? 'Account created successfully' : 'Signed in successfully',
    data: result,
  })
})
