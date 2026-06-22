import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as createOrderService from '../services/create-order.service.js'
import type { CreateOrderBody } from '../validations/order.validation.js'

export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  if (!req.store) {
    throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  }

  const body = req.body as CreateOrderBody
  const result = await createOrderService.createOrder(req.store.id, req.store.currency, {
    ...body,
    source: 'storefront',
  })

  res.status(201).json({
    success: true,
    message:
      body.payment_method === 'cod'
        ? 'Order placed successfully (cash on delivery)'
        : body.payment_method === 'upi'
          ? 'Order created — payment proof received, waiting for store confirmation'
          : 'Order created — complete Razorpay payment to confirm',
    data: result,
  })
})
