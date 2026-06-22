import * as orderRepository from '../../orders/repositories/order.repository.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { AppError } from '../../../shared/errors/app.error.js'
import {
  assertRazorpayConfigured,
  parseStoredPaymentConfig,
} from '../lib/payment-config.js'
import { markRazorpayOrderPaid } from './mark-razorpay-order-paid.service.js'
import { verifyRazorpayPaymentSignature } from './razorpay.service.js'
import type { VerifyRazorpayPaymentBody } from '../validations/verify-razorpay-payment.validation.js'

export async function verifyRazorpayPaymentForStore(
  storeId: number,
  orderId: number,
  body: VerifyRazorpayPaymentBody
) {
  const order = await orderRepository.findOrderByIdAndCheckoutToken(orderId, body.checkout_token)
  if (!order || order.store_id !== storeId) {
    throw new AppError(404, 'Order not found', 'ORDER_NOT_FOUND')
  }

  const payment = await orderRepository.findPaymentByOrderId(orderId)
  if (!payment || payment.provider !== 'razorpay') {
    throw new AppError(400, 'This order does not use Razorpay', 'INVALID_PAYMENT_METHOD')
  }

  if (order.payment_status === 'paid' && payment.status === 'paid') {
    return {
      order_id: order.id,
      order_number: order.order_number,
      payment_status: order.payment_status,
      order_status: order.order_status,
    }
  }

  if (payment.provider_order_id !== body.razorpay_order_id) {
    throw new AppError(400, 'Razorpay order does not match this payment', 'INVALID_RAZORPAY_ORDER')
  }

  const store = await storeRepository.findStoreById(storeId)
  if (!store) {
    throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  }

  const stored = parseStoredPaymentConfig(store.payment_config)
  const { key_secret } = assertRazorpayConfigured(stored)

  const valid = verifyRazorpayPaymentSignature({
    keySecret: key_secret,
    orderId: body.razorpay_order_id,
    paymentId: body.razorpay_payment_id,
    signature: body.razorpay_signature,
  })

  if (!valid) {
    throw new AppError(400, 'Invalid Razorpay payment signature', 'INVALID_PAYMENT_SIGNATURE')
  }

  const result = await markRazorpayOrderPaid({
    payment,
    providerPaymentId: body.razorpay_payment_id,
  })

  return {
    order_id: result.order.id,
    order_number: result.order.order_number,
    payment_status: result.order.payment_status,
    order_status: result.order.order_status,
  }
}
