import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as createCheckoutService from '../services/create-checkout.service.js'

export const createSubscriptionCheckout = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

  const data = await createCheckoutService.createSubscriptionCheckout(req.authUser.id)

  res.status(200).json({
    success: true,
    message: 'Subscription checkout created',
    data,
  })
})
