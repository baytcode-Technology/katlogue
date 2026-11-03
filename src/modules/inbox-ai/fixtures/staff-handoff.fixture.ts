/**
 * Staff waiting handoff: first warn, then wait.
 * Run: npx tsx src/modules/inbox-ai/fixtures/staff-handoff.fixture.ts
 */
import assert from 'node:assert/strict'
import { parseCustomerIntentOffline } from '../services/parse-customer-intent.service.js'
import {
  isStaffHandoffIssue,
  resolveStaffHandoff,
  staffConnectLine,
} from '../services/staff-handoff.service.js'
import type { Store } from '../../stores/types/store.types.js'

let failed = 0

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ok ${name}`)
    })
    .catch((err) => {
      failed += 1
      console.error(`  FAIL ${name}:`, err instanceof Error ? err.message : err)
    })
}

const store = {
  id: 1,
  shop_policies: {},
  currency: 'INR',
  country: 'India',
} as Store

const refundText =
  'njan ith order cheythitt already 1 month aayi enick correct date ariyahanm eppo product deliver aavum enn allel enick refund vehnam'

async function main() {
  console.log('\n=== Staff handoff ===')

  await test('order evide is not a staff handoff', () => {
    const parsed = parseCustomerIntentOffline('order evide')
    assert.equal(parsed.intent, 'order_status')
    assert.equal(isStaffHandoffIssue(parsed, 'order evide'), false)
  })

  await test('refund after a late order is a staff handoff issue', () => {
    const parsed = parseCustomerIntentOffline(refundText, {
      recentMessages: [{ role: 'store', text: 'Order number: OCT26-1\nFulfillment: Unfulfilled' }],
    })
    assert.equal(parsed.intent, 'order_status')
    assert.equal(isStaffHandoffIssue(parsed, refundText), true)
  })

  await test('first refund without policy is warn; second is wait', async () => {
    const parsed = parseCustomerIntentOffline(refundText, {
      recentMessages: [{ role: 'store', text: 'Order number: OCT26-1' }],
    })
    const first = await resolveStaffHandoff({
      store,
      intent: parsed,
      customerText: refundText,
      staffWarnedAt: null,
    })
    assert.equal(first, 'warn')
    const second = await resolveStaffHandoff({
      store,
      intent: parsed,
      customerText: refundText,
      staffWarnedAt: '2026-11-03T10:00:00.000Z',
    })
    assert.equal(second, 'wait')
  })

  await test('return policy with days set is policy on first ask', async () => {
    const text = 'what is your return policy'
    const parsed = parseCustomerIntentOffline(text)
    assert.equal(parsed.intent, 'shop_info')
    const decision = await resolveStaffHandoff({
      store: { ...store, shop_policies: { return_days: 7 } } as Store,
      intent: parsed,
      customerText: text,
      staffWarnedAt: null,
    })
    assert.equal(decision, 'policy')
  })

  await test('empty return policy is warn', async () => {
    const text = 'what is your return policy'
    const parsed = parseCustomerIntentOffline(text)
    const decision = await resolveStaffHandoff({
      store,
      intent: parsed,
      customerText: text,
      staffWarnedAt: null,
    })
    assert.equal(decision, 'warn')
  })

  await test('after warn, eppo kittum is wait not another AI reply', async () => {
    const text = 'chumma staff nokkum enn paranja pore enick product eppo kittum enn ariyahanm'
    const parsed = parseCustomerIntentOffline(text, {
      recentMessages: [
        { role: 'store', text: 'Customer helpline ningale contact cheyyum saar. Ee chatil wait cheyyu.' },
      ],
    })
    const decision = await resolveStaffHandoff({
      store,
      intent: parsed,
      customerText: text,
      staffWarnedAt: '2026-11-03T10:00:00.000Z',
    })
    assert.equal(decision, 'wait')
    const eppol = await resolveStaffHandoff({
      store,
      intent: parseCustomerIntentOffline('eppol'),
      customerText: 'eppol',
      staffWarnedAt: '2026-11-03T10:00:00.000Z',
    })
    assert.equal(eppol, 'wait')
  })

  await test('order evide with no warning is still not wait', async () => {
    const parsed = parseCustomerIntentOffline('order evide')
    const decision = await resolveStaffHandoff({
      store,
      intent: parsed,
      customerText: 'order evide',
      staffWarnedAt: null,
    })
    assert.equal(decision, 'none')
  })

  await test('helpline connect line is salesman-style, not staff nokkum', () => {
    assert.match(staffConnectLine('Malayalam', 'latin'), /Customer helpline ningale contact/)
    assert.doesNotMatch(staffConnectLine('Malayalam', 'latin'), /staff nokkum/i)
    assert.match(staffConnectLine('English'), /customer helpline will contact you/i)
    assert.doesNotMatch(staffConnectLine('English'), /staff will check/i)
  })

  if (failed > 0) {
    console.error(`\n${failed} fixture(s) failed validation`)
    process.exit(1)
  }
  console.log('\nAll staff handoff fixtures passed.')
}

void main()
