import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as activateSubscriptionService from '../services/activate-subscription.service.js'

type VerifyBody = {
  checkout_id: number
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

export const verifySubscriptionPayment = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

  const body = req.body as VerifyBody
  const result = await activateSubscriptionService.verifyAndActivateSubscription({
    ownerId: req.authUser.id,
    checkoutId: body.checkout_id,
    razorpayOrderId: body.razorpay_order_id,
    razorpayPaymentId: body.razorpay_payment_id,
    razorpaySignature: body.razorpay_signature,
  })

  res.status(200).json({
    success: true,
    message: 'Subscription activated',
    data: {
      store: result.store,
      subscription_plan: result.store.subscription_plan,
      subscription_expires_at: result.store.subscription_expires_at,
    },
  })
})
