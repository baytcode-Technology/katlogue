import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as createCheckoutService from '../services/create-checkout.service.js'

export const getSubscriptionCheckoutStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

  const checkoutId = String(req.query.checkout_id ?? '').trim()
  if (!checkoutId) {
    throw new AppError(400, 'checkout_id is required', 'VALIDATION_ERROR')
  }

  const result = await createCheckoutService.getSubscriptionCheckoutStatus(
    req.authUser.id,
    checkoutId
  )

  res.status(200).json({
    success: true,
    data: {
      status: result.checkout.status,
      checkout_id: result.checkout.id,
      subscription_plan: result.store?.subscription_plan ?? null,
      subscription_expires_at: result.store?.subscription_expires_at ?? null,
    },
  })
})
