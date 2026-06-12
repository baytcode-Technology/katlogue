import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as orderRepository from '../repositories/order.repository.js'
import type { z } from 'zod'
import { publicOrderStatusQuerySchema } from '../../payments/validations/payment-config.validation.js'

type PublicOrderStatusQuery = z.infer<typeof publicOrderStatusQuerySchema>

export const getPublicOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.store) {
    throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  }

  const orderId = String(req.params.orderId)
  const { token } = req.validatedQuery as PublicOrderStatusQuery

  const order = await orderRepository.findOrderByIdAndCheckoutToken(orderId, token)
  if (!order || order.store_id !== req.store.id) {
    throw new AppError(404, 'Order not found', 'ORDER_NOT_FOUND')
  }

  res.status(200).json({
    success: true,
    data: {
      order_id: order.id,
      order_number: order.order_number,
      order_status: order.order_status,
      payment_status: order.payment_status,
      total: order.total,
    },
  })
})
