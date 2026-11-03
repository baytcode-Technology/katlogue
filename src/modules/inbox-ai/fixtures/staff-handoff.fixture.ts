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

  await test('staff connect line stays Manglish for Latin Malayalam', () => {
    assert.match(staffConnectLine('Malayalam', 'latin'), /Staff ningale connect/)
    assert.doesNotMatch(staffConnectLine('Malayalam', 'latin'), /enthelum chodyangal/)
  })

  if (failed > 0) {
    console.error(`\n${failed} fixture(s) failed validation`)
    process.exit(1)
  }
  console.log('\nAll staff handoff fixtures passed.')
}

void main()
