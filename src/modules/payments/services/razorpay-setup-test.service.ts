import { randomBytes } from 'crypto'
import * as orderRepository from '../../orders/repositories/order.repository.js'
import * as storeStaffRepository from '../../stores/repositories/store-staff.repository.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { AppError } from '../../../shared/errors/app.error.js'
import {
  assertRazorpaySetupConfigured,
  getDecryptedRazorpaySecrets,
  isRazorpayVerifiedForMode,
  markRazorpayVerified,
  parseStoredPaymentConfig,
  toMerchantPaymentConfigView,
} from '../lib/payment-config.js'
import { markRazorpayOrderPaid } from './mark-razorpay-order-paid.service.js'
import { createRazorpayOrder, verifyRazorpayPaymentSignature } from './razorpay.service.js'
import type { VerifyRazorpaySetupTestBody } from '../validations/razorpay-setup-test.validation.js'
import type { StoredPaymentConfig } from '../types/payment-config.types.js'

const SETUP_TEST_SOURCE = 'razorpay_setup_test'
const SETUP_TEST_AMOUNT = 1
const SETUP_TEST_CURRENCY = 'INR'

async function persistRazorpayVerificationIfNeeded(
  storeId: number,
  stored: StoredPaymentConfig
): Promise<StoredPaymentConfig> {
  if (isRazorpayVerifiedForMode(stored)) {
    return stored
  }

  const verifiedConfig = markRazorpayVerified(stored)
  await storeRepository.updatePaymentConfig(storeId, verifiedConfig)
  return verifiedConfig
}

function toSetupTestResult(stored: StoredPaymentConfig) {
  const secrets = getDecryptedRazorpaySecrets(stored)
  const view = toMerchantPaymentConfigView(stored, {
    key_secret: secrets.key_secret ?? undefined,
    webhook_secret: secrets.webhook_secret ?? undefined,
  })

  return {
    test_passed: view.razorpay.test_passed,
    test_passed_mode: view.razorpay.test_passed_mode,
    mode: view.razorpay.mode,
  }
}

export async function createRazorpaySetupTestCheckout(ownerId: string, storeId: number) {
  const store = await storeStaffRepository.resolveOwnedStore(ownerId, storeId)

  const stored = parseStoredPaymentConfig(store.payment_config)
  assertRazorpaySetupConfigured(stored)

  const checkoutToken = randomBytes(24).toString('hex')
  const orderNumber = await orderRepository.allocateOrderNumber(store.id)

  const order = await orderRepository.insertOrder({
    store_id: store.id,
    customer_id: null,
    conversation_id: null,
    order_number: orderNumber,
    order_status: 'pending',
    payment_status: 'pending',
    fulfillment_status: 'unfulfilled',
    source: SETUP_TEST_SOURCE,
    subtotal: SETUP_TEST_AMOUNT,
    discount_amount: 0,
    shipping_fee: 0,
    tax_amount: 0,
    total: SETUP_TEST_AMOUNT,
    shipping_address: {},
    notes: 'Razorpay connection test',
    checkout_token: checkoutToken,
  })

  const payment = await orderRepository.insertPayment({
    order_id: order.id,
    store_id: store.id,
    provider: 'razorpay',
    amount: SETUP_TEST_AMOUNT,
    currency: SETUP_TEST_CURRENCY,
    status: 'pending',
  })

  const receipt = `rzp_setup_${randomBytes(6).toString('hex')}`
  const razorpayOrder = await createRazorpayOrder({
    storedConfig: stored,
    amount: SETUP_TEST_AMOUNT,
    currency: SETUP_TEST_CURRENCY,
    receipt,
    notes: {
      purpose: SETUP_TEST_SOURCE,
      store_id: String(store.id),
    },
  })

  await orderRepository.updatePayment(payment.id, {
    provider_order_id: razorpayOrder.order_id,
  })

  const mode = stored.razorpay?.mode === 'live' ? 'live' : 'test'

  return {
    order_id: order.id,
    checkout_token: checkoutToken,
    key_id: razorpayOrder.key_id,
    razorpay_order_id: razorpayOrder.order_id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    mode,
    store_name: store.name,
  }
}

export async function verifyRazorpaySetupTest(
  ownerId: string,
  storeId: number,
  body: VerifyRazorpaySetupTestBody
) {
  const store = await storeStaffRepository.resolveOwnedStore(ownerId, storeId)

  const order = await orderRepository.findOrderByIdAndCheckoutToken(body.order_id, body.checkout_token)
  if (!order || order.store_id !== store.id) {
    throw new AppError(404, 'Order not found', 'ORDER_NOT_FOUND')
  }

  if (order.source !== SETUP_TEST_SOURCE) {
    throw new AppError(400, 'This is not a Razorpay setup test order', 'INVALID_SETUP_TEST_ORDER')
  }

  const payment = await orderRepository.findPaymentByOrderId(order.id)
  if (!payment || payment.provider !== 'razorpay') {
    throw new AppError(400, 'Razorpay payment not found for this test', 'PAYMENT_NOT_FOUND')
  }

  const alreadyPaid = order.payment_status === 'paid' && payment.status === 'paid'

  if (!alreadyPaid) {
    if (payment.provider_order_id !== body.razorpay_order_id) {
      throw new AppError(400, 'Razorpay order does not match this payment', 'INVALID_RAZORPAY_ORDER')
    }

    const stored = parseStoredPaymentConfig(store.payment_config)
    const { key_secret } = assertRazorpaySetupConfigured(stored)

    const valid = verifyRazorpayPaymentSignature({
      keySecret: key_secret,
      orderId: body.razorpay_order_id,
      paymentId: body.razorpay_payment_id,
      signature: body.razorpay_signature,
    })

    if (!valid) {
      throw new AppError(400, 'Invalid Razorpay payment signature', 'INVALID_PAYMENT_SIGNATURE')
    }

    await markRazorpayOrderPaid({
      payment,
      providerPaymentId: body.razorpay_payment_id,
    })
  }

  const refreshedStore = await storeRepository.findStoreById(store.id)
  if (!refreshedStore) {
    throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  }

  const stored = parseStoredPaymentConfig(refreshedStore.payment_config)
  const verifiedConfig = await persistRazorpayVerificationIfNeeded(store.id, stored)
  const result = toSetupTestResult(verifiedConfig)

  if (!result.test_passed) {
    throw new AppError(
      500,
      'Payment succeeded but Razorpay verification could not be saved',
      'RAZORPAY_VERIFICATION_SAVE_FAILED'
    )
  }

  return result
}
