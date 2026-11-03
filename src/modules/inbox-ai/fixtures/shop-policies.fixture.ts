/**
 * Shop policy promised-by dates and customer copy.
 * Run: npx tsx src/modules/inbox-ai/fixtures/shop-policies.fixture.ts
 */
import assert from 'node:assert/strict'
import {
  addBusinessDays,
  formatShopPolicyCustomerCopy,
  formatShopPolicyFacts,
  parseShopPolicies,
  resolvePromisedByDate,
  EMPTY_SHOP_POLICIES,
} from '../../../shared/lib/shop-policies.js'
import { parseCustomerIntentOffline } from '../services/parse-customer-intent.service.js'
import { buildCannedLocalizedReply } from '../services/build-localized-reply.service.js'
import { formatOrderFactCard } from '../services/build-order-reply.service.js'
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

console.log('\n=== Shop policies ===')

test('empty policies never invent a fee or offer', () => {
  const facts = formatShopPolicyFacts(EMPTY_SHOP_POLICIES, 'INR')
  assert.match(facts, /do not invent a number/)
  assert.match(facts, /do not invent a discount/)
  const customer = formatShopPolicyCustomerCopy(EMPTY_SHOP_POLICIES, 'INR')
  assert.equal(customer, '')
  assert.doesNotMatch(customer, /%/)
})

test('skips Saturday and Sunday when adding business days', () => {
  // Friday 6 Nov 2026 + 2 business days = Tuesday 10 Nov
  assert.equal(addBusinessDays(new Date('2026-11-06T10:00:00.000Z'), 2), '2026-11-10')
})

test('product override beats shop default; missing days stay null', () => {
  assert.equal(
    resolvePromisedByDate({
      orderedAt: new Date('2026-11-06T10:00:00.000Z'),
      shopDefaultDays: 2,
      productDays: [5, 3],
    }),
    '2026-11-13'
  )
  assert.equal(
    resolvePromisedByDate({
      orderedAt: new Date('2026-11-06T10:00:00.000Z'),
      shopDefaultDays: null,
      productDays: [null],
    }),
    null
  )
})

test('COD and catalogue without a product are shop_info / greeting', () => {
  assert.equal(parseCustomerIntentOffline('Do you offer COD?').intent, 'shop_info')
  assert.equal(parseCustomerIntentOffline('where is your shop').intent, 'shop_info')
  assert.equal(parseCustomerIntentOffline('product catalogue').intent, 'greeting')
})

test('canned shop_info does not dump invent-instructions or a fake discount', () => {
  const reply = buildCannedLocalizedReply({
    template: 'shop_info',
    customerLanguage: 'English',
    facts: {
      storeName: 'Demo',
      homeUrl: 'https://demo.aishopy.io',
      shopPolicyCustomerCopy: formatShopPolicyCustomerCopy(
        parseShopPolicies({ default_delivery_business_days: 2, current_offer_note: null }),
        'INR'
      ),
      paymentCustomerFacts: 'COD: available',
      shopPolicyFacts: formatShopPolicyFacts(
        parseShopPolicies({ default_delivery_business_days: 2 }),
        'INR'
      ),
    },
  })
  assert.match(reply, /Usual delivery: 2/)
  assert.match(reply, /COD: available/)
  assert.doesNotMatch(reply, /do not invent/)
  assert.doesNotMatch(reply, /10%/)
})

test('order fact card includes promised_by when set', () => {
  const order = {
    id: 1,
    store_id: 1,
    customer_id: 10,
    conversation_id: null,
    order_number: 'NOV26-1',
    order_status: 'confirmed',
    payment_status: 'paid',
    fulfillment_status: 'unfulfilled',
    source: 'storefront',
    subtotal: 500,
    discount_amount: 0,
    shipping_fee: 0,
    tax_amount: 0,
    total: 500,
    coupon_id: null,
    coupon_code: null,
    shipping_address: {},
    shipping_method: null,
    tracking_number: null,
    promised_by: '2026-11-10',
    delay_note: 'Courier delay',
    courier_name: null,
    tracking_url: null,
    notes: null,
    admin_notes: null,
    checkout_token: null,
    merchant_viewed_at: null,
    created_at: '2026-11-03T10:00:00.000Z',
    updated_at: '2026-11-03T10:00:00.000Z',
    items: [],
    payment: null,
  } as unknown as OrderWithDetails
  const card = formatOrderFactCard(order, 'INR')
  assert.match(card, /Promised by: 2026-11-10/)
  assert.match(card, /Delay note: Courier delay/)
})

if (failed > 0) {
  console.error(`\n${failed} fixture(s) failed validation`)
  process.exit(1)
}

console.log('\nAll shop policy fixtures passed.')
