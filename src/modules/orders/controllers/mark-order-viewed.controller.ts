import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as markOrderViewedService from '../services/mark-order-viewed.service.js'
import type { GetOrderQuery } from '../validations/update-order.validation.js'
import type { OrderIdParam } from '../validations/update-order.validation.js'

export const markOrderViewed = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const { store_id } = req.validatedQuery as GetOrderQuery
  const { orderId } = req.params as unknown as OrderIdParam
  const order = await markOrderViewedService.markOrderViewedByMerchant(
    req.authUser.id,
    store_id,
    orderId
  )

  res.status(200).json({
    success: true,
    message: 'Order marked as viewed',
    data: { order },
  })
})
