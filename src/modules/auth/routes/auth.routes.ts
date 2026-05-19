import { Router } from 'express'
import { signIn } from '../controllers/sign-in.controller.js'
import { verifyOtp } from '../controllers/verify-otp.controller.js'
import { validateBody } from '../../../shared/middleware/validate.middleware.js'
import { signInSchema, verifyOtpSchema } from '../validations/auth.validation.js'

const router = Router()

router.post('/signin', validateBody(signInSchema), signIn)
router.post('/verify', validateBody(verifyOtpSchema), verifyOtp)

export default router
