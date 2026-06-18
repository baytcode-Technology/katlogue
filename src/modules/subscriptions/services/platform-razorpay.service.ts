import { createHmac, timingSafeEqual } from 'crypto'
import Razorpay from 'razorpay'
import { env, isPlatformRazorpayConfigured } from '../../../config/env.js'
import { AppError } from '../../../shared/errors/app.error.js'

export type PlatformRazorpayOrderPayload = {
  key_id: string
  order_id: string
  amount: number
  currency: string
}

function assertPlatformRazorpayConfigured(): { keyId: string; keySecret: string } {
  if (!isPlatformRazorpayConfigured()) {
    throw new AppError(
      503,
      'Platform subscription billing is not configured',
      'PLATFORM_RAZORPAY_NOT_CONFIGURED'
    )
  }

  return {
    keyId: env.PLATFORM_RAZORPAY.KEY_ID!,
    keySecret: env.PLATFORM_RAZORPAY.KEY_SECRET!,
  }
}

export async function createPlatformOrder(input: {
  amountMinorUnits: number
  currency: string
  receipt: string
  notes: Record<string, string>
}): Promise<PlatformRazorpayOrderPayload> {
  const { keyId, keySecret } = assertPlatformRazorpayConfigured()

  if (input.amountMinorUnits < 100) {
    throw new AppError(400, 'Subscription amount is too low for Razorpay', 'RAZORPAY_MIN_AMOUNT')
  }

  const client = new Razorpay({ key_id: keyId, key_secret: keySecret })
  const order = await client.orders.create({
    amount: input.amountMinorUnits,
    currency: input.currency.toUpperCase(),
    receipt: input.receipt,
    notes: input.notes,
  })

  return {
    key_id: keyId,
    order_id: order.id,
    amount: input.amountMinorUnits,
    currency: order.currency,
  }
}

export function verifyPlatformPaymentSignature(input: {
  orderId: string
  paymentId: string
  signature: string
}): boolean {
  const { keySecret } = assertPlatformRazorpayConfigured()
  const body = `${input.orderId}|${input.paymentId}`
  const expected = createHmac('sha256', keySecret).update(body).digest('hex')

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(input.signature))
  } catch {
    return false
  }
}

export function verifyPlatformWebhookSignature(
  rawBody: string,
  signature: string | undefined
): boolean {
  const webhookSecret = env.PLATFORM_RAZORPAY.WEBHOOK_SECRET
  if (!webhookSecret || !signature) return false

  const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}
