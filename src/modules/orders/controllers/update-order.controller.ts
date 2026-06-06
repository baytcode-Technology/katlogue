import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as updateOrderService from '../services/update-order.service.js'
import type { UpdateOrderBody } from '../validations/update-order.validation.js'

export const updateOrder = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const body = req.body as UpdateOrderBody
  const orderId = req.params.orderId
  const { store_id: storeId, ...patch } = body

  const order = await updateOrderService.updateOrderStatuses(
    req.authUser.id,
    storeId,
    orderId,
    patch
  )

  res.status(200).json({
    success: true,
    message: 'Order updated successfully',
    data: { order },
  })
})
