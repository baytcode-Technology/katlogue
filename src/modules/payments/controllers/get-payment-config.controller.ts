import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as paymentConfigService from '../services/payment-config.service.js'

export const getPaymentConfig = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const data = await paymentConfigService.getPaymentConfigForOwner(req.authUser.id)

  res.status(200).json({
    success: true,
    message: 'Payment configuration loaded',
    data,
  })
})
