import { AppError } from '../../../shared/errors/app.error.js'
import { verifyPlatformWebhookSignature } from './platform-razorpay.service.js'
import { activateSubscriptionByProviderOrderId } from './activate-subscription.service.js'

type RazorpayWebhookPayload = {
  event: string
  payload?: {
    payment?: {
      entity?: {
        id?: string
        order_id?: string
        status?: string
      }
    }
  }
}

export async function processPlatformRazorpayWebhook(
  rawBody: string,
  signature: string | undefined
): Promise<void> {
  if (!verifyPlatformWebhookSignature(rawBody, signature)) {
    throw new AppError(401, 'Invalid Razorpay webhook signature', 'INVALID_WEBHOOK_SIGNATURE')
  }

  let payload: RazorpayWebhookPayload
  try {
    payload = JSON.parse(rawBody) as RazorpayWebhookPayload
  } catch {
    throw new AppError(400, 'Invalid webhook payload', 'INVALID_WEBHOOK')
  }

  const paymentEntity = payload.payload?.payment?.entity
  const providerOrderId = paymentEntity?.order_id
  const providerPaymentId = paymentEntity?.id

  if (!providerOrderId || !providerPaymentId) {
    throw new AppError(400, 'Missing Razorpay payment details in webhook', 'INVALID_WEBHOOK')
  }

  if (payload.event !== 'payment.captured' && paymentEntity?.status !== 'captured') {
    return
  }

  try {
    await activateSubscriptionByProviderOrderId({
      providerOrderId,
      providerPaymentId,
    })
  } catch (err) {
    if (err instanceof AppError && err.code === 'CHECKOUT_NOT_FOUND') {
      return
    }
    throw err
  }
}
