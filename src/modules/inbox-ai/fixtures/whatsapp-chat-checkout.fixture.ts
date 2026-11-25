/**
 * WhatsApp pay-in-chat decisions. No model and no database.
 * Run: npx tsx src/modules/inbox-ai/fixtures/whatsapp-chat-checkout.fixture.ts
 */
import assert from 'node:assert/strict'
import { SESSION_MAX_AGE_MS } from '../services/conversation-history.service.js'
import {
  addressFromCheckoutParse,
  buyQuantity,
  checkoutProductFromUrl,
  isBuyPhrase,
  lastCheckoutProduct,
  nextCheckoutClaim,
  paymentAmountMatches,
  readImageDecision,
  type PendingCheckout,
} from '../pending-checkout.js'

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

function waitingCheckout(amountStatus: PendingCheckout['status'] = 'awaiting_proof'): PendingCheckout {
  return {
    status: amountStatus,
    product_id: 42,
    variant_id: 9,
    quantity: 1,
    title: 'Check Shirt',
    address: {
      name: 'Amina',
      phone_number: '919876543210',
      address: '12 Beach Road',
      city: 'Kochi',
      district: 'Ernakulam',
      state: 'Kerala',
      postcode: '682001',
    },
    created_at: new Date().toISOString(),
  }
}

console.log('\n=== WhatsApp chat checkout ===')

test('product id and variant come from the store link', () => {
  const parsed = checkoutProductFromUrl('https://shop.aishopy.io/product/check-shirt-42?variant=9')
  assert.deepEqual(parsed, { productId: 42, variantId: 9 })
  assert.deepEqual(checkoutProductFromUrl('https://shop.aishopy.io/product/check-shirt-42'), {
    productId: 42,
    variantId: null,
  })
})

test('a buy phrase uses the one product link in this visit', () => {
  assert.equal(isBuyPhrase('ok'), false)
  assert.equal(isBuyPhrase('yes'), false)
  assert.equal(isBuyPhrase('venam'), true)
  assert.equal(isBuyPhrase('order cheyyam'), true)
  assert.equal(buyQuantity('venam'), 1)
  assert.equal(buyQuantity('2 venam'), 2)

  const shown = lastCheckoutProduct([
    {
      role: 'store',
      text: 'Also:\nhttps://shop.aishopy.io/product/pant-3\nhttps://shop.aishopy.io/product/shirt-4',
    },
    {
      role: 'store',
      text: 'Check Shirt\nhttps://shop.aishopy.io/product/check-shirt-42?variant=9',
    },
  ])
  assert.deepEqual(shown, {
    productId: 42,
    variantId: 9,
    url: 'https://shop.aishopy.io/product/check-shirt-42?variant=9',
  })
})

test('a photo with no waiting payment is ignored', () => {
  assert.equal(
    readImageDecision({
      checkout: null,
      nowMs: Date.now(),
      isPaymentSuccess: false,
      amount: null,
      catalogTotal: 999,
    }),
    'ignore'
  )
})

test('a payment screenshot with a different amount does not create an order', () => {
  assert.equal(paymentAmountMatches(999, 1000), false)
  assert.equal(
    readImageDecision({
      checkout: waitingCheckout(),
      nowMs: Date.now(),
      isPaymentSuccess: true,
      amount: 1000,
      catalogTotal: 999,
    }),
    'ask_again'
  )
})

test('a matching payment screenshot can create one order', () => {
  assert.equal(paymentAmountMatches(999.4, 999), true)
  assert.equal(
    readImageDecision({
      checkout: waitingCheckout(),
      nowMs: Date.now(),
      isPaymentSuccess: true,
      amount: 999,
      catalogTotal: 999.4,
    }),
    'create'
  )
})

test('a second photo cannot claim the same checkout', () => {
  const now = Date.now()
  const first = nextCheckoutClaim(waitingCheckout(), now)
  assert.equal(first?.status, 'creating')
  assert.equal(nextCheckoutClaim(first, now), null)
  const expired = waitingCheckout()
  expired.created_at = new Date(now - SESSION_MAX_AGE_MS - 1000).toISOString()
  assert.equal(nextCheckoutClaim(expired, now), null)
})

test('an address without a PIN is not complete', () => {
  const parsed = addressFromCheckoutParse(
    {
      name: 'Amina',
      address: '12 Beach Road',
      city: 'Kochi',
      district: 'Ernakulam',
      state: 'Kerala',
    },
    '919876543210'
  )
  assert.equal(parsed.ok, false)
  if (!parsed.ok) assert.ok(parsed.missing.includes('PIN'))
})

if (failed > 0) {
  console.error(`\n${failed} whatsapp checkout fixture(s) failed`)
  process.exit(1)
}
console.log('\nAll whatsapp checkout fixtures passed.')
