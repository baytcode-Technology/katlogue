import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as verifyRazorpayPaymentService from '../../payments/services/verify-razorpay-payment.service.js'
import type { VerifyRazorpayPaymentBody } from '../../payments/validations/verify-razorpay-payment.validation.js'

export const verifyRazorpayPayment = asyncHandler(async (req: Request, res: Response) => {
  if (!req.store) {
    throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  }

  const orderId = Number(req.params.orderId)
  if (!Number.isFinite(orderId) || orderId <= 0) {
    throw new AppError(400, 'Invalid order id', 'VALIDATION_ERROR')
  }

  const body = req.body as VerifyRazorpayPaymentBody
  const data = await verifyRazorpayPaymentService.verifyRazorpayPaymentForStore(
    req.store.id,
    orderId,
    body
  )

  res.status(200).json({
    success: true,
    message: 'Payment verified successfully',
    data,
  })
})
