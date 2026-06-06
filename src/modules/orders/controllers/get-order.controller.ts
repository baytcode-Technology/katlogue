import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as getOrderService from '../services/get-order.service.js'
import type { GetOrderQuery } from '../validations/update-order.validation.js'

export const getOrder = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const { store_id: storeId } = req.query as GetOrderQuery
  const orderId = req.params.orderId

  const order = await getOrderService.getOrderById(req.authUser.id, storeId, orderId)

  res.status(200).json({
    success: true,
    message: 'Order fetched successfully',
    data: order,
  })
})
