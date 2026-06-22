import { createHmac, timingSafeEqual } from 'crypto'
import Razorpay from 'razorpay'
import { AppError } from '../../../shared/errors/app.error.js'
import type { StoredPaymentConfig } from '../types/payment-config.types.js'
import { assertRazorpayConfigured } from '../lib/payment-config.js'

export function verifyRazorpayPaymentSignature(input: {
  keySecret: string
  orderId: string
  paymentId: string
  signature: string
}): boolean {
  const body = `${input.orderId}|${input.paymentId}`
  const expected = createHmac('sha256', input.keySecret).update(body).digest('hex')

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(input.signature))
  } catch {
    return false
  }
}

export type RazorpayOrderPayload = {
  key_id: string
  order_id: string
  amount: number
  currency: string
}

export async function createRazorpayOrder(input: {
  storedConfig: StoredPaymentConfig
  amount: number
  currency: string
  receipt: string
  notes: Record<string, string>
}): Promise<RazorpayOrderPayload> {
  const { key_id, key_secret } = assertRazorpayConfigured(input.storedConfig)
  const amountPaise = Math.round(input.amount * 100)

  if (amountPaise < 100) {
    throw new AppError(400, 'Order total must be at least ₹1 for Razorpay', 'RAZORPAY_MIN_AMOUNT')
  }

  const client = new Razorpay({ key_id, key_secret })
  const order = await client.orders.create({
    amount: amountPaise,
    currency: input.currency.toUpperCase(),
    receipt: input.receipt,
    notes: input.notes,
  })

  return {
    key_id,
    order_id: order.id,
    amount: amountPaise,
    currency: order.currency,
  }
}
