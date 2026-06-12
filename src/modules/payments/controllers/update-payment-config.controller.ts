import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as paymentConfigService from '../services/payment-config.service.js'
import type { UpdatePaymentConfigBody } from '../validations/payment-config.validation.js'

export const updatePaymentConfig = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const body = req.body as UpdatePaymentConfigBody
  const data = await paymentConfigService.updatePaymentConfigForOwner(req.authUser.id, body)

  res.status(200).json({
    success: true,
    message: 'Payment configuration updated',
    data,
  })
})
