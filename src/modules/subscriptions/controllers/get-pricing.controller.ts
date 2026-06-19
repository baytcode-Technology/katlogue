import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as getPricingService from '../services/get-pricing.service.js'

export const getSubscriptionPricing = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

  const data = await getPricingService.getSubscriptionPricing(req.authUser.id)

  res.status(200).json({
    success: true,
    data,
  })
})
