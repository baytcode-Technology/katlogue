/**
 * Validates inbox AI order intent extraction, matching, and redaction helpers.
 * Run: npx tsx src/modules/inbox-ai/fixtures/order-reply.fixture.ts
 */
import assert from 'node:assert/strict'
import {
  phoneTail,
  toCanonicalWhatsAppNumber,
} from '../../../shared/utils/phone.js'
import {
  extractOrderNumber,
  extractOrderNumberHint,
  extractOrderProductHint,
  extractPhoneFromText,
  isOrderStatusMessage,
  resolveOrderScope,
} from '../services/parse-customer-intent.service.js'
import {
  formatOrderFactsBlock,
  formatOrderStatusLabel,
  formatPaymentProviderLabel,
  parseOrderItemSnapshot,
} from '../services/build-order-reply.service.js'
import type { OrderWithDetails } from '../../orders/repositories/order.repository.js'

let failed = 0

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`  ok ${name}`)
  } catch (err) {
    failed += 1
    console.error(`  FAIL ${name}:`, err instanceof Error ? err.message : err)
  }
}

console.log('\n=== Phone identity ===')

test('country-code and local numbers share the same tail', () => {
  assert.equal(phoneTail('917736230788'), phoneTail('7736230788'))
  assert.equal(phoneTail('+91 77362 30788'), '7736230788')
})

test('canonicalizes 10-digit Indian numbers', () => {
  assert.equal(toCanonicalWhatsAppNumber('7736230788', 'India'), '917736230788')
  assert.equal(toCanonicalWhatsAppNumber('917736230788', 'India'), '917736230788')
})

console.log('\n=== Order intent extraction ===')

test('extracts monthly order number', () => {
  assert.equal(extractOrderNumber('status of order JAN26-5 please'), 'JAN26-5')
  assert.equal(extractOrderNumber('order #FEB26-12'), 'FEB26-12')
})

test('extracts bare order suffix', () => {
  assert.equal(extractOrderNumberHint('order 88'), '88')
  assert.equal(extractOrderNumberHint('order 10 please'), '10')
  assert.equal(extractOrderNumberHint('status of order JAN26-5'), null)
})

test('detects order status phrases including Manglish', () => {
  assert.equal(isOrderStatusMessage('where is my order'), true)
  assert.equal(isOrderStatusMessage('order evide'), true)
  assert.equal(isOrderStatusMessage('do you have blue shirts'), false)
})

test('resolves order scope', () => {
  assert.equal(resolveOrderScope('order JAN26-3', 'JAN26-3', null), 'specific')
  assert.equal(resolveOrderScope('my last order', null, null), 'latest')
  assert.equal(resolveOrderScope('where is my shirt order', null, 'shirt'), 'product')
})

test('extracts product hint from order question', () => {
  const hint = extractOrderProductHint('where is my shirt order')
  assert.ok(hint?.includes('shirt'))
})

test('extracts typed phone and ignores order numbers', () => {
  assert.equal(extractPhoneFromText('I ordered on 7736230788'), '7736230788')
  assert.equal(extractPhoneFromText('status of order JAN26-5'), null)
  assert.equal(extractPhoneFromText('order 88'), null)
})

console.log('\n=== Status and provider formatting ===')

test('formats order status labels', () => {
  assert.equal(formatOrderStatusLabel('in_transit'), 'In transit')
  assert.equal(formatOrderStatusLabel('partially_paid'), 'Partially paid')
})

test('formats payment provider labels', () => {
  assert.equal(formatPaymentProviderLabel('manual'), 'COD')
  assert.equal(formatPaymentProviderLabel('upi_manual'), 'UPI')
  assert.equal(formatPaymentProviderLabel('razorpay'), 'Razorpay')
})

console.log('\n=== Snapshot parsing ===')

test('parses order item snapshot', () => {
  const parsed = parseOrderItemSnapshot({
    id: 1,
    order_id: 1,
    product_id: 1,
    variant_id: 2,
    quantity: 1,
    unit_price: 500,
    total_price: 500,
    snapshot: {
      product: { name: 'Blue Shirt' },
      variant: { name: 'Large' },
    },
  })
  assert.equal(parsed.productName, 'Blue Shirt')
  assert.equal(parsed.variantName, 'Large')
})

function mockOrder(overrides: Partial<OrderWithDetails> & Pick<OrderWithDetails, 'order_number'>): OrderWithDetails {
  const { order_number, ...rest } = overrides
  return {
    id: 1,
    store_id: 1,
    customer_id: 10,
    conversation_id: null,
    order_number,
    order_status: 'confirmed',
    payment_status: 'paid',
    fulfillment_status: 'fulfilled',
    source: 'storefront',
    subtotal: 500,
    discount_amount: 0,
    shipping_fee: 0,
    tax_amount: 0,
    total: 500,
    coupon_id: null,
    coupon_code: null,
    shipping_address: {
      name: 'Nuaim Panackal',
      address: 'Mannancherry',
      city: 'Alappuzha',
      district: 'Alappuzha',
      state: 'kerala',
      postcode: '688538',
    },
    shipping_method: 'Standard',
    tracking_number: 'TRK123',
    notes: null,
    admin_notes: 'secret',
    checkout_token: 'secret-token',
    merchant_viewed_at: null,
    created_at: '2026-01-15T10:00:00.000Z',
    updated_at: '2026-01-15T10:00:00.000Z',
    items: [],
    payment: {
      id: 1,
      order_id: 1,
      store_id: 1,
      provider: 'manual',
      provider_order_id: 'secret-order-id',
      provider_payment_id: 'secret-payment-id',
      payment_proof_url: 'https://secret/proof.jpg',
      amount: 500,
      currency: 'INR',
      status: 'paid',
      paid_at: '2026-01-15T10:05:00.000Z',
      created_at: '2026-01-15T10:00:00.000Z',
    },
    ...rest,
  }
}

console.log('\n=== Facts block redaction and details ===')

test('facts block includes name, address, qty, prices and excludes secrets', () => {
  const order = mockOrder({
    order_number: 'AUG26-10',
    items: [
      {
        id: 1,
        order_id: 1,
        product_id: 1,
        variant_id: null,
        quantity: 2,
        unit_price: 250,
        total_price: 500,
        snapshot: { product: { name: 'Cap' } },
      },
    ],
  })

  const facts = formatOrderFactsBlock(order, 'INR')
  assert.match(facts, /AUG26-10/)
  assert.match(facts, /Recipient: Nuaim Panackal/)
  assert.match(facts, /Address: Mannancherry/)
  assert.match(facts, /x2/)
  assert.match(facts, /Tracking: TRK123/)
  assert.match(facts, /Payment method: COD/)
  assert.doesNotMatch(facts, /secret-token/)
  assert.doesNotMatch(facts, /secret-order-id/)
  assert.doesNotMatch(facts, /secret-payment-id/)
  assert.doesNotMatch(facts, /secret\/proof/)
  assert.doesNotMatch(facts, /admin_notes/)
})

if (failed > 0) {
  console.error(`\n${failed} fixture(s) failed validation`)
  process.exit(1)
}

console.log('\nAll inbox AI order reply fixtures passed.')
