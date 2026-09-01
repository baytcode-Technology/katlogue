import { Router } from 'express'
import { signIn } from '../controllers/sign-in.controller.js'
import { verifyOtp } from '../controllers/verify-otp.controller.js'
import { googleSignIn } from '../controllers/google-sign-in.controller.js'
import { appleSignIn } from '../controllers/apple-sign-in.controller.js'
import { googleExchangeCode } from '../controllers/google-exchange-code.controller.js'
import { refreshToken } from '../controllers/refresh-token.controller.js'
import { deleteAccount } from '../controllers/delete-account.controller.js'
import { requireAuth } from '../../../shared/middleware/auth.middleware.js'
import { validateBody } from '../../../shared/middleware/validate.middleware.js'
import {
  appleSignInSchema,
  googleCodeExchangeSchema,
  googleSignInSchema,
  refreshTokenSchema,
  signInSchema,
  verifyOtpSchema,
} from '../validations/auth.validation.js'

const router = Router()

router.post('/signin', validateBody(signInSchema), signIn)
router.post('/verify', validateBody(verifyOtpSchema), verifyOtp)
router.post('/google', validateBody(googleSignInSchema), googleSignIn)
router.post('/apple', validateBody(appleSignInSchema), appleSignIn)
router.post('/google/code', validateBody(googleCodeExchangeSchema), googleExchangeCode)
router.post('/refresh', validateBody(refreshTokenSchema), refreshToken)
router.delete('/account', requireAuth, deleteAccount)

export default router
