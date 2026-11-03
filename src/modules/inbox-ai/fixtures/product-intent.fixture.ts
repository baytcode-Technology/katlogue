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
  resolveOrderAsk,
} from '../services/parse-customer-intent.service.js'
import { extractLastShownProduct, filterSessionHistory } from '../services/conversation-history.service.js'
import {
  pickPrimaryCatalogMatch,
  productMatchesRequestedCategory,
  resolveEffectiveSearchQuery,
  scoreProduct,
  formatProductCaption,
  formatShopCategories,
} from '../services/catalog-search.service.js'
import type { CatalogMatch } from '../services/catalog-search.service.js'
import { composeCatalogStaffReply, selectCatalogOffer } from '../services/build-product-reply.service.js'
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

console.log('\n=== This visit only ===')

test('a hi 15 days later does not keep the old product', () => {
  const now = Date.parse('2026-11-03T06:00:00.000Z')
  const old = new Date(now - 15 * 24 * 60 * 60 * 1000).toISOString()
  const filtered = filterSessionHistory(
    [
      { role: 'customer', text: 'blue shirt undo?', at: old },
      {
        role: 'store',
        text: 'Ind saar\n\nhttps://shrox.aishopy.io/product/linen-shirt-4',
        at: old,
      },
      { role: 'customer', text: 'hi', at: new Date(now).toISOString() },
    ],
    now
  )
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0]?.text, 'hi')
  assert.equal(extractLastShownProduct(filtered), null)
  const parsed = parseCustomerIntentOffline('hi')
  assert.equal(parsed.intent, 'greeting')
  assert.equal(parsed.searchQuery, '')
  assert.equal(parsed.sku, null)
})

test('a colour follow-up inside the visit keeps the shirt', () => {
  const now = Date.parse('2026-11-03T06:00:00.000Z')
  const recent = new Date(now - 10 * 60 * 1000).toISOString()
  const lines = filterSessionHistory(
    [
      { role: 'customer', text: 'blue shirt undo?', at: recent },
      {
        role: 'store',
        text: 'https://shrox.aishopy.io/product/linen-shirt-4',
        at: recent,
      },
    ],
    now
  )
  const parsed = parseCustomerIntentOffline('white?', { recentMessages: lines })
  assert.equal(parsed.intent, 'product_search')
  assert.equal(parsed.categoryName, 'shirts')
  assert.equal(parsed.color, 'White')
  assert.match(parsed.searchQuery, /shirt/i)
  assert.equal(parsed.alternativeCategories.length, 0)
})

console.log('\n=== Staff understanding ===')

test('hi with a product is a product ask, not a greeting', () => {
  const parsed = parseCustomerIntentOffline('Hi, I need a blue shirt')
  assert.equal(parsed.intent, 'product_search')
  assert.equal(parsed.categoryName, 'shirts')
  assert.equal(parsed.color, 'Blue')
})

test('marriage is tone; kurta is searched before shirt', () => {
  const parsed = parseCustomerIntentOffline(
    'tomorrow I have a marriage so I need a blue kurta or shirt'
  )
  assert.equal(parsed.intent, 'product_search')
  assert.equal(parsed.categoryName, 'kurtas')
  assert.deepEqual(parsed.alternativeCategories, ['shirts'])
  assert.equal(parsed.color, 'Blue')
  assert.match(parsed.searchQuery, /kurta/i)
  assert.equal(/marriage|tomorrow/i.test(parsed.searchQuery), false)
})

test('SKU-001 stays whole and an order number is not a SKU', () => {
  const sku = parseCustomerIntentOffline('SKU-001')
  assert.equal(sku.intent, 'sku_lookup')
  assert.equal(sku.sku, 'SKU-001')

  const labeled = parseCustomerIntentOffline('sku SKU-001')
  assert.equal(labeled.sku, 'SKU-001')

  const bare = parseCustomerIntentOffline('ABC-12')
  assert.equal(bare.intent, 'sku_lookup')
  assert.equal(bare.sku, 'ABC-12')

  const order = parseCustomerIntentOffline('order JAN26-5')
  assert.equal(order.intent, 'order_status')
  assert.equal(order.sku, null)
  assert.notEqual(parseCustomerIntentOffline('ok').intent, 'sku_lookup')
  assert.notEqual(parseCustomerIntentOffline('hi').intent, 'sku_lookup')
})

test('missing kurta falls through to shirts with a code-built caption', () => {
  const shirt = {
    product: { name: 'Blue Formal Shirt', sku: 'SHIRT-9' },
    variant: {
      name: 'L',
      sku: 'SHIRT-9-L',
      options: { Color: 'Blue', Size: 'L' },
    },
    price: 799,
    url: 'https://shrox.aishopy.io/product/blue-formal-shirt-3',
    score: 80,
  } as unknown as CatalogMatch
  const kurta = {
    product: { name: 'Blue Kurta' },
    variant: null,
    price: 900,
    url: 'https://shrox.aishopy.io/product/blue-kurta-1',
    score: 90,
  } as unknown as CatalogMatch

  const missed = selectCatalogOffer({
    primary: [],
    alternatives: [{ category: 'shirts', matches: [shirt] }],
    requestedItem: 'blue kurta',
  })
  assert.equal(missed.missingItem, 'blue kurta')
  assert.equal(missed.offeredCategory, 'shirts')
  assert.equal(missed.matches[0], shirt)

  const found = selectCatalogOffer({
    primary: [kurta],
    alternatives: [{ category: 'shirts', matches: [shirt] }],
    requestedItem: 'blue kurta',
  })
  assert.equal(found.missingItem, null)
  assert.equal(found.matches[0], kurta)

  const reply = composeCatalogStaffReply([
    "We don't have blue kurta sir. We have shirts.",
    formatProductCaption(shirt, 'INR'),
    'Which size do you need?',
  ])
  assert.match(reply, /kurta/i)
  assert.match(reply, /shirts/i)
  assert.match(reply, /SHIRT-9-L/)
  assert.match(reply, /https:\/\/shrox\.aishopy\.io\/product\/blue-formal-shirt-3/)
})

test("this shop's own departments match, not only clothing words", () => {
  const mixer = extractRequestedCategory('mixer undo?', ['Appliances', 'Mixers'])
  assert.equal(mixer, 'Mixers')
  const parsed = parseCustomerIntentOffline('mixer undo?', {
    storeCategories: ['Appliances', 'Mixers'],
  })
  assert.equal(parsed.intent, 'product_search')
  assert.equal(parsed.categoryName, 'Mixers')
})

test('a bag ask does not treat shirts as named alternatives', () => {
  const bag = parseCustomerIntentOffline('Enick oru bag vehnam')
  assert.equal(bag.intent, 'product_search')
  assert.equal(bag.alternativeCategories.length, 0)
  assert.equal(/bag/i.test(bag.searchQuery + ' ' + (bag.requestedItem ?? '')), true)

  const offer = selectCatalogOffer({
    primary: [],
    alternatives: [],
    requestedItem: bag.requestedItem,
  })
  assert.equal(offer.matches.length, 0)
  assert.equal(offer.offeredCategory, null)

  const sells = formatShopCategories({
    productNames: ['Linen Shirt', 'Check Shirt'],
    categoryNames: ['Men', 'shirts', 'pants'],
  })
  assert.deepEqual(sells, ['Men', 'shirts', 'pants'])
  assert.equal(sells.includes('Linen Shirt'), false)
})

console.log('\n=== Staff message intents ===')

test('illa enickonnum venda okay is refuse, not a sale', () => {
  const parsed = parseCustomerIntentOffline('illa enickonnum venda okay')
  assert.equal(parsed.intent, 'refuse')
  assert.equal(parsed.searchQuery, '')
})

test('malayalathil paray after shoes miss continues shoes, not Hi', () => {
  const parsed = parseCustomerIntentOffline('malayalathil paray', {
    recentMessages: [
      { role: 'customer', text: 'shoes undo?' },
      { role: 'store', text: 'shoes illa saar. Ee shop Men, shirts aanu.' },
    ],
  })
  assert.equal(parsed.intent, 'language_switch')
  assert.equal(parsed.customerLanguage, 'Malayalam')
  assert.equal(parsed.sessionTopic, 'missing')
  assert.equal(parsed.requestedItem, 'shoes')
})

test('stock out vs shopil illa after shoes miss stays a shoes miss', () => {
  const parsed = parseCustomerIntentOffline('stock out ayathahno atho shopil illayo?', {
    recentMessages: [
      { role: 'customer', text: 'shoes undo?' },
      { role: 'store', text: 'shoes illa saar. Ee shop Men, shirts aanu.' },
    ],
  })
  assert.equal(parsed.intent, 'product_search')
  assert.equal(parsed.categoryName, 'shoes')
  assert.equal(parsed.missingWhy, 'not_sold')
})

test('ok after an order status is acknowledgement on that order', () => {
  const parsed = parseCustomerIntentOffline('ok', {
    recentMessages: [
      {
        role: 'store',
        text: 'Order number: OCT26-1\nPlaced: 26 Oct 2026\nFulfillment: Unfulfilled',
      },
    ],
  })
  assert.equal(parsed.intent, 'acknowledgement')
  assert.equal(parsed.sessionTopic, 'order')
})

test('is this my last order is confirm_last, not another full dump', () => {
  assert.equal(resolveOrderAsk('is this my last order', 'order', true), 'confirm_last')
  const parsed = parseCustomerIntentOffline('is this my last order', {
    recentMessages: [{ role: 'store', text: 'Order number: OCT26-1\nFulfillment: Unfulfilled' }],
  })
  assert.equal(parsed.intent, 'order_status')
  assert.equal(parsed.orderAsk, 'confirm_last')
})

test('why and one-month wait are hints, not the same eta stamp', () => {
  const why = parseCustomerIntentOffline('time kittiyillenna why', {
    recentMessages: [{ role: 'store', text: 'Order number: OCT26-1' }],
  })
  assert.equal(why.intent, 'order_status')
  assert.equal(why.orderAsk, 'why')
  const delay = parseCustomerIntentOffline(
    'njan ith oct 1 n book cheythethahn ipo 1 month kayinj eppo kittum',
    { recentMessages: [{ role: 'store', text: 'Order number: OCT26-1' }] }
  )
  assert.equal(delay.intent, 'order_status')
  assert.equal(delay.orderAsk, 'delay')
})

test('last order details after a paste is not full again', () => {
  const parsed = parseCustomerIntentOffline('last order details', {
    recentMessages: [{ role: 'store', text: 'Order number: OCT26-1\nFulfillment: Unfulfilled' }],
  })
  assert.equal(parsed.intent, 'order_status')
  assert.equal(parsed.orderAsk, 'confirm_last')
})

test('eppo deliver and pettann vehnam are eta/urgency', () => {
  const eta = parseCustomerIntentOffline('eppo deliver', {
    recentMessages: [{ role: 'store', text: 'Order number: OCT26-1' }],
  })
  assert.equal(eta.intent, 'order_status')
  assert.equal(eta.orderAsk, 'eta')
  const urgent = parseCustomerIntentOffline('pettann vehnam eppo kittum', {
    recentMessages: [{ role: 'store', text: 'Order number: OCT26-1' }],
  })
  assert.equal(urgent.intent, 'order_status')
  assert.equal(urgent.orderAsk, 'urgency')
})

test('cancel my order is cancel, not a fake product search', () => {
  const parsed = parseCustomerIntentOffline('cancel my order')
  assert.equal(parsed.intent, 'order_status')
  assert.equal(parsed.orderAsk, 'cancel')
})

test('price? with no item is a bare price ask', () => {
  const parsed = parseCustomerIntentOffline('price?')
  assert.equal(parsed.searchQuery, '')
  assert.equal(parsed.categoryName, null)
})

test('COD without a product is shop_info, not a sale', () => {
  const parsed = parseCustomerIntentOffline('Do you offer COD?')
  assert.equal(parsed.intent, 'shop_info')
  assert.equal(parsed.searchQuery, '')
})

test('product catalogue is a greeting, not a random SKU search', () => {
  const parsed = parseCustomerIntentOffline('product catalogue')
  assert.equal(parsed.intent, 'greeting')
})

test('shop location after an order stays shop_info, not a sale', () => {
  const parsed = parseCustomerIntentOffline('ningada shop varunnath evidahn', {
    recentMessages: [
      { role: 'store', text: 'Order number: OCT26-1\nFulfillment: Unfulfilled' },
      { role: 'store', text: 'Ee orderil delivery date illa. Ippo unfulfilled aanu. Staff nokkum.' },
    ],
  })
  assert.equal(parsed.intent, 'shop_info')
})

test('one month wait plus refund is this order, not shop policy', () => {
  const parsed = parseCustomerIntentOffline(
    'njan ith order cheythitt already 1 month aayi enick correct date ariyahanm eppo product deliver aavum enn allel enick refund vehnam',
    {
      recentMessages: [
        { role: 'store', text: 'Order number: OCT26-1\nFulfillment: Unfulfilled' },
      ],
    }
  )
  assert.equal(parsed.intent, 'order_status')
  assert.equal(parsed.orderAsk, 'delay')
})

if (failed > 0) {
  console.error(`\n${failed} fixture(s) failed validation`)
  process.exit(1)
}

console.log('\nAll inbox AI product intent fixtures passed.')
