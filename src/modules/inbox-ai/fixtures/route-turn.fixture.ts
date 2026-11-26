/**
 * Code decides the turn before the model speaks.
 * Run: npx tsx src/modules/inbox-ai/fixtures/route-turn.fixture.ts
 */
import assert from 'node:assert/strict'
import { routeCustomerTurn } from '../lib/route-turn.js'

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

const card = {
  role: 'store' as const,
  text: 'Force Men Printed Round Neck Cotton Blend Black T-Shirt\nhttps://eatomatic.co.in/product/force-men-printed-round-neck-cotton-blend-black-t-shirt-21?variant=116\nOrder cheyyano sir?',
}
const sells = ['T Shirt', 'Shirt', 'Pants']

console.log('\n=== Route turn ===')

test('ys after order cheyyano is a book', () => {
  const route = routeCustomerTurn({ text: 'ys', recentMessages: [card], shopSells: sells })
  assert.equal(route.kind, 'book')
  if (route.kind === 'book') assert.equal(route.quantity, 1)
})

test('1, size s on the last card is a book', () => {
  const route = routeCustomerTurn({
    text: '1 ,size s',
    recentMessages: [card],
    shopSells: sells,
  })
  assert.equal(route.kind, 'book')
  if (route.kind === 'book') assert.equal(route.quantity, 1)
})

test('book through whatsapp pays in chat', () => {
  const route = routeCustomerTurn({
    text: 'i need to book through whatsapp',
    recentMessages: [card],
    shopSells: sells,
  })
  assert.deepEqual(route, { kind: 'book', quantity: 1, payHere: true })
})

test('t shirt vehnam with no card is a product search', () => {
  const route = routeCustomerTurn({
    text: 'enick oru t shirt vehnam',
    recentMessages: [],
    shopSells: sells,
  })
  assert.equal(route.kind, 'product')
})

test('pants vehnam after a t-shirt is a product search', () => {
  const route = routeCustomerTurn({
    text: 'pants vehnam',
    recentMessages: [card],
    shopSells: sells,
  })
  assert.equal(route.kind, 'product')
})

test('ente last order is a placed order', () => {
  const route = routeCustomerTurn({
    text: 'ente last order',
    recentMessages: [card],
    shopSells: sells,
  })
  assert.equal(route.kind, 'placed_order')
})

test('return cheyan parumo is the returns fact', () => {
  const route = routeCustomerTurn({
    text: 'return cheyan parumo',
    recentMessages: [],
    shopSells: sells,
  })
  assert.deepEqual(route, { kind: 'shop_fact', ask: 'returns' })
})

test('ys with no card is not a book', () => {
  const route = routeCustomerTurn({ text: 'ys', recentMessages: [], shopSells: sells })
  assert.notEqual(route.kind, 'book')
})

if (failed > 0) {
  console.error(`\n${failed} route fixture(s) failed`)
  process.exit(1)
}
console.log('\nAll route fixtures passed.')
