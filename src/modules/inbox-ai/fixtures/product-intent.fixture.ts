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
  isProductCorrectionMessage,
  parseCustomerIntentOffline,
  resolveOrderAsk,
} from '../services/parse-customer-intent.service.js'
import {
  extractLastShownProduct,
  extractOpenOffer,
  filterSessionHistory,
} from '../services/conversation-history.service.js'
import {
  pickPrimaryCatalogMatch,
  productMatchesRequestedCategory,
  resolveEffectiveSearchQuery,
  scoreProduct,
  formatProductCaption,
  formatShopCategories,
  MIN_MATCH_SCORE,
  pickBestVariant,
  toMatch,
} from '../services/catalog-search.service.js'
import type { CatalogMatch } from '../services/catalog-search.service.js'
import {
  composeCatalogStaffReply,
  resolveSellableOffer,
  selectCatalogOffer,
} from '../services/build-product-reply.service.js'
import { isProductSellable } from '../../products/utils/product-inventory.js'
import type { Product } from '../../products/types/product.types.js'
import type { ProductVariant } from '../../products/types/product-variant.types.js'

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
  assert.match(parsed.searchQuery, /pant/i)
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
  assert.match(parsed.searchQuery, /pants/i)
  assert.equal(parsed.categoryName, 'pants')
})

test('check shirt keeps check, not a bare shirt query', () => {
  const ask = 'hi njan oru video kanditt message cheyyavahn oru check shirt'
  const offline = parseCustomerIntentOffline(ask)
  assert.equal(offline.intent, 'product_search')
  assert.match(offline.searchQuery, /check/i)
  assert.match(offline.searchQuery, /shirt/i)
  const fromLlm = fromLlmResult(
    {
      intent: 'product_search',
      customerLanguage: 'Malayalam',
      searchQuery: 'shirt',
      categoryName: 'shirts',
    },
    ask
  )
  assert.match(fromLlm.searchQuery, /check/i)
  const correction = parseCustomerIntentOffline(
    'aah okay enick aa check shirt aahn vendath athinte details ayackava',
    {
      recentMessages: [
        { role: 'store', text: 'https://shrox.aishopy.io/product/linen-shirt-8' },
      ],
    }
  )
  assert.equal(correction.intent, 'product_search')
  assert.equal(correction.rejectsLastShown, true)
  assert.match(correction.searchQuery, /check/i)
  const linen = { name: 'Linen Shirt', description: 'plain linen' }
  const check = { name: 'Check Shirt', description: 'checked cotton' }
  const linenScore = scoreProduct(linen, 'check shirt', 'shirts')
  const checkScore = scoreProduct(check, 'check shirt', 'shirts')
  assert.ok(checkScore > linenScore, `expected check (${checkScore}) > linen (${linenScore})`)
  const primary = pickPrimaryCatalogMatch(
    [
      { product: linen as Product, variant: null, price: 566, url: 'https://x/linen', score: linenScore },
      { product: check as Product, variant: null, price: 499, url: 'https://x/check', score: checkScore },
    ] as CatalogMatch[],
    'shirts'
  )
  assert.equal(primary?.product.name, 'Check Shirt')
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
      { role: 'store', text: 'Ee orderil delivery date illa. Ippo unfulfilled aanu. Customer helpline ningale contact cheyyum.' },
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

test('t-shirt is not the same category as a collared shirt', () => {
  assert.equal(extractRequestedCategory('I need t shirt'), 'tshirts')
  assert.equal(extractRequestedCategory('blue shirt undo'), 'shirts')
  const shirt = { name: 'METRONAUT Men Regular Fit Striped Spread Collar Casual Shirt', description: 'casual shirt' }
  const tee = { name: 'Cotton Crew Neck T-Shirt', description: 'plain tee' }
  assert.equal(productMatchesRequestedCategory(shirt, 'tshirts'), false)
  assert.equal(productMatchesRequestedCategory(tee, 'tshirts'), true)
  assert.equal(productMatchesRequestedCategory(shirt, 'shirts'), true)
  const shirtScore = scoreProduct(shirt, 't-shirt', 'tshirts')
  const teeScore = scoreProduct(tee, 't-shirt', 'tshirts')
  assert.ok(teeScore > shirtScore, `expected tee (${teeScore}) > shirt (${shirtScore})`)
  const primary = pickPrimaryCatalogMatch(
    [
      { product: shirt as Product, variant: null, price: 399, url: 'https://x/shirt', score: 80 },
      { product: tee as Product, variant: null, price: 299, url: 'https://x/tee', score: 40 },
    ] as CatalogMatch[],
    'tshirts',
  )
  assert.equal(primary?.product.name, tee.name)
})

test('correction drops the last shirt and searches t-shirt', () => {
  const text = 'Ith shirt alle enick t shirt aahn vendath'
  assert.equal(isProductCorrectionMessage(text), true)
  const parsed = parseCustomerIntentOffline(text, {
    recentMessages: [
      { role: 'store', text: 'https://shrox.aishopy.io/product/metronaut-casual-shirt-18' },
    ],
  })
  assert.equal(parsed.intent, 'product_search')
  assert.equal(parsed.rejectsLastShown, true)
  assert.equal(parsed.categoryName, 'tshirts')
})

test('mixie maps to this shop Mixers department, not shirts', () => {
  const category = extractRequestedCategory('mixie undo', ['Mixers', 'Men'])
  assert.equal(category, 'Mixers')
  const parsed = parseCustomerIntentOffline('mixie undo', {
    storeCategories: ['Mixers', 'Men'],
  })
  assert.equal(parsed.intent, 'product_search')
  assert.equal(parsed.categoryName, 'Mixers')
})

test('cheyyahnam is buy, not another product search', () => {
  const parsed = parseCustomerIntentOffline('Cheyyahnam', {
    recentMessages: [
      { role: 'store', text: 'https://shrox.aishopy.io/product/casual-shirt-18' },
    ],
  })
  assert.equal(parsed.intent, 'buy_intent')
})

test('englishil paray is a language switch and okay stays English', () => {
  const switchAsk = parseCustomerIntentOffline('Okay ithonn englishil paray')
  assert.equal(switchAsk.intent, 'language_switch')
  assert.equal(switchAsk.customerLanguage, 'English')
  const after = parseCustomerIntentOffline('Okay', {
    recentMessages: [{ role: 'customer', text: 'tell me in english' }],
  })
  assert.equal(after.intent, 'acknowledgement')
  assert.equal(after.customerLanguage, 'English')
})

console.log('\n=== Stock and this shop departments ===')

const SHOP_DEPARTMENTS = ['Men', 'Shirt', 'T Shirt', 'Pants']

function stockProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 21,
    name: 'Force Men Printed Round Neck Cotton Blend Black T-Shirt',
    slug: 'force-tee',
    description: null,
    base_price: 368,
    track_inventory: true,
    stock_qty: 0,
    mark_as_sold: false,
    mark_as_non_inventory: false,
    category_id: 5,
    ...overrides,
  } as unknown as Product
}

function stockVariant(
  id: number,
  name: string,
  overrides: Partial<ProductVariant> = {}
): ProductVariant {
  const [size, colour] = name.split(' / ')
  return {
    id,
    product_id: 21,
    name,
    options: { Size: size, Colour: colour },
    price_delta: 0,
    stock_qty: 0,
    is_active: true,
    mark_as_sold: false,
    mark_as_non_inventory: false,
    ...overrides,
  } as unknown as ProductVariant
}

test('t shirts, t-shirts and tshirts all pick this shop T Shirt department', () => {
  for (const text of ['i need t shirts', 'i need t-shirts', 'tshirts undo', 'i need t shirt']) {
    const parsed = parseCustomerIntentOffline(text, { storeCategories: SHOP_DEPARTMENTS })
    assert.equal(parsed.categoryName, 'T Shirt', text)
  }
  assert.equal(
    parseCustomerIntentOffline('i need shirts', { storeCategories: SHOP_DEPARTMENTS }).categoryName,
    'Shirt'
  )
  assert.equal(parseCustomerIntentOffline('i need t shirts').categoryName, 'tshirts')
})

test('T Shirt department is not the Shirt department', () => {
  const tee = stockProduct()
  const linen = stockProduct({ id: 8, name: 'Linen Shirt', category_id: 2 })
  assert.equal(productMatchesRequestedCategory(tee, 'T Shirt', 'T Shirt'), true)
  assert.equal(productMatchesRequestedCategory(linen, 'T Shirt', 'Shirt'), false)
  assert.equal(productMatchesRequestedCategory(linen, 'Shirt', 'Shirt'), true)
  assert.equal(productMatchesRequestedCategory(tee, 'Shirt', 'T Shirt'), false)
  const teeScore = scoreProduct(tee, 'T Shirt', 'T Shirt', 'T Shirt')
  const linenScore = scoreProduct(linen, 'T Shirt', 'T Shirt', 'Shirt')
  assert.ok(teeScore >= MIN_MATCH_SCORE, `tee score ${teeScore}`)
  assert.ok(linenScore < MIN_MATCH_SCORE, `linen score ${linenScore}`)
})

test('non-inventory variants with 0 stock are offered, not sold out', () => {
  const product = stockProduct()
  const variants = ['S / White', 'S / Black', 'M / Black'].map((name, i) =>
    stockVariant(i + 1, name, { mark_as_non_inventory: true })
  )
  assert.equal(isProductSellable(product, variants), true)
  const variant = pickBestVariant(product, variants, { query: 't-shirt' })
  const match = toMatch('shrox', product, variant, 80, variants, 'T Shirt')
  assert.equal(match.inStock, true)
  const offer = resolveSellableOffer('shrox', [match], { size: null, color: null })
  assert.equal(offer.matches.length, 1)
  assert.equal(offer.soldOutOption, null)
})

test('product stock 0 is ignored when a variant has stock', () => {
  const product = stockProduct({ stock_qty: 0 })
  const variants = [
    stockVariant(1, 'S / White', { stock_qty: 0 }),
    stockVariant(2, 'M / Black', { stock_qty: 4 }),
  ]
  const variant = pickBestVariant(product, variants, { query: 't-shirt' })
  assert.equal(variant?.id, 2, 'prefers the variant that can be sold')
  const match = toMatch('shrox', product, variant, 80, variants)
  assert.equal(match.inStock, true)
})

test('asked size is out but another sells: offer it and name the missing size', () => {
  const product = stockProduct()
  const variants = [
    stockVariant(1, 'L / White', { stock_qty: 0 }),
    stockVariant(2, 'M / Black', { stock_qty: 3 }),
  ]
  const variant = pickBestVariant(product, variants, { query: 't-shirt', size: 'L' })
  assert.equal(variant?.id, 1)
  const match = toMatch('shrox', product, variant, 80, variants)
  assert.equal(match.inStock, false)
  const offer = resolveSellableOffer('shrox', [match], { size: 'L', color: null })
  assert.equal(offer.matches.length, 1)
  assert.equal(offer.matches[0].variant?.id, 2)
  assert.equal(offer.matches[0].inStock, true)
  assert.match(offer.matches[0].url, /2/)
  assert.equal(offer.soldOutOption, 'Size L')
})

test('every tracked variant at 0 is still honestly sold out', () => {
  const product = stockProduct()
  const variants = [
    stockVariant(1, 'S / White', { stock_qty: 0 }),
    stockVariant(2, 'M / Black', { stock_qty: 0 }),
    stockVariant(3, 'L / Black', { stock_qty: 9, mark_as_sold: true }),
  ]
  assert.equal(isProductSellable(product, variants), false)
  const match = toMatch('shrox', product, pickBestVariant(product, variants, { query: '' }), 80, variants)
  const offer = resolveSellableOffer('shrox', [match], { size: null, color: null })
  assert.equal(offer.matches.length, 0)
})

test('simple product: untracked or non-inventory sells, tracked at 0 does not', () => {
  assert.equal(isProductSellable(stockProduct({ track_inventory: false }), []), true)
  assert.equal(isProductSellable(stockProduct({ mark_as_non_inventory: true }), []), true)
  assert.equal(isProductSellable(stockProduct(), []), false)
  assert.equal(isProductSellable(stockProduct({ stock_qty: 2 }), []), true)
  assert.equal(isProductSellable(stockProduct({ stock_qty: 2, mark_as_sold: true }), []), false)
})

console.log('\n=== Answer to our order offer ===')

const OFFER_URL =
  'https://shrox.aishopy.io/product/force-men-printed-round-neck-cotton-blend-black-t-shirt-21?variant=117&src=wa_1009'
const OFFER_THREAD = [
  { role: 'customer' as const, text: 'i need black colour with size s' },
  {
    role: 'store' as const,
    text: `Ind saar, we have the black T-shirt in size S available for you.\n\nForce Men Printed Round Neck Cotton Blend Black T-Shirt — S / Black\n₹368\nColor: Black | Size: S\n\n${OFFER_URL}\n\nWould you like to place an order for it?`,
  },
]

test('open offer keeps the S / Black variant link and our question', () => {
  const offer = extractOpenOffer(OFFER_THREAD)
  assert.equal(offer?.url, OFFER_URL)
  assert.equal(offer?.question, 'Would you like to place an order for it?')
  assert.equal(extractOpenOffer([...OFFER_THREAD, { role: 'customer', text: 'yes' }])?.url, OFFER_URL)
})

test('a newer store turn or a link without a question is no open offer', () => {
  assert.equal(
    extractOpenOffer([...OFFER_THREAD, { role: 'customer', text: 'ok' }, { role: 'store', text: 'Alright sir.' }]),
    null
  )
  assert.equal(
    extractOpenOffer([{ role: 'store', text: `Here it is sir.\n\n${OFFER_URL}` }]),
    null
  )
})

test('model yes to the offer is buy, no is refuse, a new item stays product search', () => {
  const yes = fromLlmResult(
    { intent: 'acknowledgement', customerLanguage: 'English', searchQuery: '', replyToLastQuestion: 'yes' },
    'yes',
    [],
    OFFER_THREAD
  )
  assert.equal(yes.intent, 'buy_intent')
  assert.equal(yes.replyToLastQuestion, 'yes')
  const hole = fromLlmResult(
    {
      intent: 'product_search',
      customerLanguage: 'English',
      searchQuery: 't-shirt',
      color: 'black',
      categoryName: 'tshirts',
      replyToLastQuestion: null,
    },
    'yes',
    ['T Shirt'],
    OFFER_THREAD
  )
  assert.equal(hole.intent, 'buy_intent')
  assert.equal(hole.searchQuery, '')
  assert.equal(hole.replyToLastQuestion, 'yes')
  for (const text of ['haa', 'Yes please']) {
    const parsed = fromLlmResult(
      { intent: 'product_search', customerLanguage: 'English', searchQuery: 't-shirt', replyToLastQuestion: null },
      text,
      [],
      OFFER_THREAD
    )
    assert.equal(parsed.intent, 'buy_intent', text)
    assert.equal(parsed.searchQuery, '', text)
  }
  const haa = fromLlmResult(
    { intent: 'product_search', customerLanguage: 'Malayalam', searchQuery: 'haa', replyToLastQuestion: 'yes' },
    'haa venam',
    [],
    OFFER_THREAD
  )
  assert.equal(haa.intent, 'buy_intent')
  assert.equal(haa.searchQuery, '')
  const no = fromLlmResult(
    { intent: 'acknowledgement', customerLanguage: 'English', searchQuery: '', replyToLastQuestion: 'no' },
    'not now',
    [],
    OFFER_THREAD
  )
  assert.equal(no.intent, 'refuse')
  const other = fromLlmResult(
    { intent: 'product_search', customerLanguage: 'English', searchQuery: 'pants', categoryName: 'pants', replyToLastQuestion: null },
    'do you have pants',
    [],
    OFFER_THREAD
  )
  assert.equal(other.intent, 'product_search')
})

test('a yes with no open offer is ignored', () => {
  const parsed = fromLlmResult(
    { intent: 'acknowledgement', customerLanguage: 'English', searchQuery: '', replyToLastQuestion: 'yes' },
    'yes',
    [],
    [{ role: 'store', text: 'Hello sir, welcome to Shrox.' }]
  )
  assert.equal(parsed.intent, 'acknowledgement')
  assert.equal(parsed.replyToLastQuestion, null)
})

test('offline: a short answer to the offer is buy, never a product search', () => {
  for (const text of ['yes', 'Yes please', 'haa', 'ha ji']) {
    const parsed = parseCustomerIntentOffline(text, { recentMessages: OFFER_THREAD })
    assert.equal(parsed.intent, 'buy_intent', text)
    assert.equal(parsed.searchQuery, '', text)
  }
  assert.equal(parseCustomerIntentOffline('venda', { recentMessages: OFFER_THREAD }).intent, 'refuse')
  assert.equal(
    parseCustomerIntentOffline('pants undo?', { recentMessages: OFFER_THREAD }).intent,
    'product_search'
  )
})

if (failed > 0) {
  console.error(`\n${failed} fixture(s) failed validation`)
  process.exit(1)
}

console.log('\nAll inbox AI product intent fixtures passed.')
