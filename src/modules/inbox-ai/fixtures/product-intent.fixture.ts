/**
 * Validates inbox AI product intent and catalog ranking for pairing requests.
 * Run: npx tsx src/modules/inbox-ai/fixtures/product-intent.fixture.ts
 */
import assert from 'node:assert/strict'
import {
  detectLanguageAndScript,
  extractRequestedCategory,
  extractRequestedColor,
  fromLlmResult,
  parseCustomerIntentOffline,
} from '../services/parse-customer-intent.service.js'
import { extractLastShownProduct } from '../services/conversation-history.service.js'
import {
  pickPrimaryCatalogMatch,
  productMatchesRequestedCategory,
  resolveEffectiveSearchQuery,
  scoreProduct,
} from '../services/catalog-search.service.js'
import type { CatalogMatch } from '../services/catalog-search.service.js'
import type { Product } from '../../products/types/product.types.js'

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

const PAIRING_MALAYALAM =
  'aah ok ente kayyil oru green shirt ond enick athin pair cheyyan pattiya oru pant koodi vehnam olla pantsinte images ayackavo'

console.log('\n=== Requested category / color ===')

test('Malayalam pairing: owned green shirt, requested pants images', () => {
  const category = extractRequestedCategory(PAIRING_MALAYALAM)
  const color = extractRequestedColor(PAIRING_MALAYALAM, category)
  assert.equal(category, 'pants')
  assert.equal(color, null)
})

test('follow-up after shirt thread: loose pants vendam', () => {
  assert.equal(extractRequestedCategory('loose pants vendam'), 'pants')
})

test('simple blue shirt undo stays shirts + blue', () => {
  const text = 'blue shirt undo?'
  const category = extractRequestedCategory(text)
  const color = extractRequestedColor(text, category)
  assert.equal(category, 'shirts')
  assert.equal(color, 'Blue')
})

test('LLM shirt query is overridden by current pants message', () => {
  const parsed = fromLlmResult(
    {
      intent: 'product_search',
      customerLanguage: 'Malayalam',
      searchQuery: 'shirt',
      categoryName: 'shirts',
      color: 'green',
      requestedItem: 'green shirt',
    },
    PAIRING_MALAYALAM
  )
  assert.equal(parsed.searchQuery, 'pants')
  assert.equal(parsed.categoryName, 'pants')
  assert.equal(parsed.color, null)
})

test('LLM shirt query is overridden by loose pants follow-up', () => {
  const parsed = fromLlmResult(
    {
      intent: 'product_search',
      customerLanguage: 'Malayalam',
      searchQuery: 'shirt',
      categoryName: 'shirts',
      color: 'green',
    },
    'ee vanna photo shirt aahnallo enick vendath loose pants aahn'
  )
  assert.equal(parsed.searchQuery, 'pants')
  assert.equal(parsed.categoryName, 'pants')
})

test('simple blue shirt LLM result stays shirt', () => {
  const parsed = fromLlmResult(
    {
      intent: 'product_search',
      customerLanguage: 'English',
      searchQuery: 'shirt',
      categoryName: 'shirts',
      color: 'blue',
      requestedItem: 'blue shirt',
    },
    'blue shirt undo?'
  )
  assert.equal(parsed.searchQuery, 'shirt')
  assert.equal(parsed.categoryName, 'shirts')
  assert.equal(parsed.color, 'blue')
})

console.log('\n=== Reactions and buy intent ===')

test('bare "ok" is an acknowledgement, never a product search', () => {
  const parsed = parseCustomerIntentOffline('ok')
  assert.equal(parsed.intent, 'acknowledgement')
  assert.equal(parsed.searchQuery, '')
  assert.equal(parsed.requestedItem, null)
})

test('"ok" from the LLM as product_search is corrected to acknowledgement', () => {
  const parsed = fromLlmResult(
    { intent: 'product_search', customerLanguage: 'English', searchQuery: 'shirt' },
    'ok'
  )
  assert.equal(parsed.intent, 'acknowledgement')
  assert.equal(parsed.searchQuery, '')
  assert.equal(parsed.categoryName, null)
})

test('thanks, sheri, and emoji-only are acknowledgements', () => {
  for (const text of ['thanks', 'thank you sir', 'sheri', 'ശരി', 'ok saar', '👍', 'super']) {
    assert.equal(parseCustomerIntentOffline(text).intent, 'acknowledgement', text)
  }
})

test('"ok blue shirt undo?" still searches the catalog', () => {
  const parsed = parseCustomerIntentOffline('ok blue shirt undo?')
  assert.equal(parsed.intent, 'product_search')
  assert.equal(parsed.categoryName, 'shirts')
  assert.equal(parsed.color, 'Blue')
})

test('buy phrases become buy_intent, not order_status', () => {
  for (const text of ['order cheyyam', 'how to order', 'ഓർഡർ ചെയ്യാം', "i'll take it"]) {
    const parsed = parseCustomerIntentOffline(text)
    assert.equal(parsed.intent, 'buy_intent', text)
    assert.equal(parsed.searchQuery, '', text)
  }
})

test('order tracking questions still resolve to order_status', () => {
  for (const text of ['where is my order', 'order status', 'order JAN26-5', 'order evide']) {
    assert.equal(parseCustomerIntentOffline(text).intent, 'order_status', text)
  }
})

console.log('\n=== Language and script detection ===')

test('Manglish is Malayalam in Latin script, not English', () => {
  const detected = detectLanguageAndScript('blue shirt undo?')
  assert.equal(detected.language, 'Malayalam')
  assert.equal(detected.scriptStyle, 'latin')
  assert.equal(parseCustomerIntentOffline('blue shirt undo?').scriptStyle, 'latin')
})

test('Malayalam script stays Malayalam script', () => {
  const detected = detectLanguageAndScript('വെള്ള shirt ഉണ്ടോ?')
  assert.equal(detected.language, 'Malayalam')
  assert.equal(detected.scriptStyle, 'malayalam_script')
})

test('plain English stays English', () => {
  const detected = detectLanguageAndScript('do you have a blue shirt?')
  assert.equal(detected.language, 'English')
  assert.equal(detected.scriptStyle, 'latin')
})

test('an LLM Malayalam label with Latin text answers in Manglish', () => {
  const parsed = fromLlmResult(
    { intent: 'product_search', customerLanguage: 'Malayalam', searchQuery: 'shirt' },
    'blue shirt undo?'
  )
  assert.equal(parsed.scriptStyle, 'latin')
})

console.log('\n=== Last shown product ===')

test('last shown product comes from the product URL slug', () => {
  const last = extractLastShownProduct([
    { role: 'customer', text: 'blue shirt undo?' },
    {
      role: 'store',
      text: 'Ind saar, ithaa.\n\nTyzlo Men Regular Fit Green Shirt\n₹566\n\nhttps://shrox.aishopy.io/product/tyzlo-men-regular-fit-green-shirt-12',
    },
    { role: 'customer', text: 'ok' },
  ])
  assert.equal(last?.title, 'Tyzlo Men Regular Fit Green Shirt')
  assert.ok(last?.url?.includes('/product/'))
})

test('a store-link-only message is not treated as a shown product', () => {
  const last = extractLastShownProduct([
    { role: 'store', text: 'Hello sir. Our store: https://shrox.aishopy.io' },
  ])
  assert.equal(last, null)
})

test('the multi-product follow-up is skipped in favour of the single product', () => {
  const last = extractLastShownProduct([
    {
      role: 'store',
      text: 'Ind saar.\n\nLinen Shirt\n₹700\n\nhttps://shrox.aishopy.io/product/linen-shirt-4',
    },
    {
      role: 'store',
      text: 'Ithupole vereyum ind:\n\n• A — ₹1\n  https://shrox.aishopy.io/product/a-1\n\n• B — ₹2\n  https://shrox.aishopy.io/product/b-2',
    },
  ])
  assert.equal(last?.title, 'Linen Shirt')
})

console.log('\n=== Catalog ranking ===')

test('effective query prefers pants over stale shirt searchQuery', () => {
  assert.equal(resolveEffectiveSearchQuery('shirt', 'pants'), 'pants')
  assert.equal(resolveEffectiveSearchQuery('shirt', 'shirts'), 'shirt')
})

test('trousers rank above green shirts when query is pants', () => {
  const shirt = { name: 'Tyzlo Men Regular Fit Green Shirt', description: 'casual shirt' }
  const trousers = { name: 'Loose Fit Brown Lycra Blend Trousers', description: 'relaxed pants' }

  const shirtScore = scoreProduct(shirt, 'shirt', 'pants')
  const trousersScore = scoreProduct(trousers, 'shirt', 'pants')
  assert.ok(
    trousersScore > shirtScore,
    `expected trousers (${trousersScore}) > shirt (${shirtScore})`
  )
  assert.equal(productMatchesRequestedCategory(trousers, 'pants'), true)
  assert.equal(productMatchesRequestedCategory(shirt, 'pants'), false)
})

test('primary match is trousers, not the shirt image product', () => {
  const shirtProduct = { name: 'Linen Shirt' } as Product
  const pantsProduct = { name: 'Relaxed Men White Cotton Blend Trousers' } as Product
  const matches = [
    { product: shirtProduct, variant: null, price: 566, url: 'https://x/shirt', score: 130 },
    { product: pantsProduct, variant: null, price: 469, url: 'https://x/pants', score: 50 },
  ] as CatalogMatch[]

  const primary = pickPrimaryCatalogMatch(matches, 'pants')
  assert.equal(primary?.product.name, pantsProduct.name)
})

if (failed > 0) {
  console.error(`\n${failed} fixture(s) failed validation`)
  process.exit(1)
}

console.log('\nAll inbox AI product intent fixtures passed.')
