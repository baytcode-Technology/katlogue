import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as listOrdersService from '../services/list-orders.service.js'
import type { ListOrdersQuery } from '../validations/merchant-order.validation.js'

export const listOrders = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const { store_id } = req.validatedQuery as ListOrdersQuery
  const orders = await listOrdersService.listOrdersByStore(req.authUser.id, store_id)

  res.status(200).json({
    success: true,
    message: 'Orders fetched successfully',
    data: {
      store_id,
      orders,
      count: orders.length,
    },
  })
})
