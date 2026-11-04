/**
 * Spoken Malayalam canned path, stiff-copy rejection, and merchant script match.
 * Run: npx tsx src/modules/inbox-ai/fixtures/malayalam-reply.fixture.ts
 */
import assert from 'node:assert/strict'
import {
  detectLanguageAndScript,
  isEnglishSupportBodyValid,
  isStiffTranslationMalayalam,
} from '../../../shared/lib/detect-language-script.js'
import { buildSupportSystemPrompt } from '../../support/knowledge/katlogue-support-knowledge.js'
import {
  resolveEnglishHowToBody,
  SUPPORT_MALAYALAM_LEAD,
  wrapMalayalamScriptSupportReply,
} from '../../support/lib/wrap-malayalam-support-reply.js'
import {
  buildCannedLocalizedReply,
  isHonestNoOrderTalk,
  isHonestOrderTalk,
  isHonestProductClosing,
  isHonestStockTalk,
  isReplyScriptValid,
  shouldSkipModelForMalayalamScript,
} from '../services/build-localized-reply.service.js'

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

const facts = {
  storeName: 'Shrox',
  homeUrl: 'https://shrox.aishopy.io',
}

console.log('\n=== Script detection ===')

test('Manglish stays latin Malayalam', () => {
  const detected = detectLanguageAndScript('blue shirt undo?')
  assert.equal(detected.language, 'Malayalam')
  assert.equal(detected.scriptStyle, 'latin')
})

test('Malayalam script is detected', () => {
  const detected = detectLanguageAndScript('ഷർട്ട് ഉണ്ടോ?')
  assert.equal(detected.language, 'Malayalam')
  assert.equal(detected.scriptStyle, 'malayalam_script')
})

console.log('\n=== Stiff translation Malayalam ===')

test('rejects textbook shop copy', () => {
  assert.equal(
    isStiffTranslationMalayalam('ഞങ്ങളുടെ സ്ഥാപനത്തിൽ പ്രസ്തുത ഉൽപ്പന്നം ലഭ്യമാണ്.'),
    true
  )
})

test('accepts spoken shop Malayalam', () => {
  assert.equal(isStiffTranslationMalayalam('ഉണ്ട് സാർ. ഏത് സൈസ് വേണം?'), false)
})

test('script check rejects stiff Malayalam', () => {
  assert.equal(
    isReplyScriptValid(
      'ഞങ്ങളുടെ സ്ഥാപനത്തിൽ പ്രസ്തുത ഉൽപ്പന്നം ലഭ്യമാണ്.',
      'Malayalam',
      'malayalam_script'
    ),
    false
  )
})

test('script check rejects Tamil mixed into Malayalam', () => {
  assert.equal(
    isReplyScriptValid('உண்டு സാർ ഏത് സൈസ് വേണം?', 'Malayalam', 'malayalam_script'),
    false
  )
})

console.log('\n=== Staff talk is not a canned prefix ===')

test('the model writes greeting and not-found, including Malayalam script', () => {
  assert.equal(
    shouldSkipModelForMalayalamScript('Malayalam', 'malayalam_script', 'greeting'),
    false
  )
  assert.equal(
    shouldSkipModelForMalayalamScript('Malayalam', 'malayalam_script', 'not_found'),
    false
  )
  assert.equal(
    shouldSkipModelForMalayalamScript('Malayalam', 'malayalam_script', 'product_lines'),
    false
  )
  assert.equal(shouldSkipModelForMalayalamScript('Malayalam', 'latin', 'greeting'), false)
})

test('rejects Ind saar on a not-found reply', () => {
  assert.equal(isHonestStockTalk('Ind saar! Bag stock illa, shirts und.', 'not_found'), false)
  assert.equal(isHonestStockTalk('Bag illa saar. Ee shop shirts, pants aanu.', 'not_found'), true)
  assert.equal(isHonestStockTalk('Ind saar 👍 Ethu size vendam?', 'product_lines'), true)
})

test('canned greeting for an appliance shop uses those departments', () => {
  const reply = buildCannedLocalizedReply({
    customerLanguage: 'Malayalam',
    scriptStyle: 'latin',
    template: 'greeting',
    facts: { ...facts, shopSells: ['Appliances', 'Mixers'] },
  })
  assert.match(reply, /Appliances/)
  assert.match(reply, /Mixers/)
  assert.equal(/\bMen\b/.test(reply), false)
  assert.equal(/linen shirt/i.test(reply), false)
  assert.equal(/^Ind saar/i.test(reply.trim()), false)
})

test('canned greeting asks from shop categories, not size or colour', () => {
  const reply = buildCannedLocalizedReply({
    customerLanguage: 'Malayalam',
    scriptStyle: 'latin',
    template: 'greeting',
    facts: { ...facts, shopSells: ['Men', 'shirts', 'pants'] },
  })
  assert.match(reply, /Hai saar/)
  assert.match(reply, /Men/)
  assert.match(reply, /shirts/)
  assert.equal(/ethu size/i.test(reply), false)
  assert.equal(/^Ind saar/i.test(reply.trim()), false)
  assert.equal(reply.includes('https://shrox.aishopy.io'), true)
})

test('canned Malayalam-script greeting stays spoken and uses categories', () => {
  const reply = buildCannedLocalizedReply({
    customerLanguage: 'Malayalam',
    scriptStyle: 'malayalam_script',
    template: 'greeting',
    facts: { ...facts, shopSells: ['Men', 'shirts'] },
  })
  assert.match(reply, /ഹായ് സാർ/)
  assert.match(reply, /Men/)
  assert.equal(reply.includes('നമസ്കാരം'), false)
  assert.equal(reply.includes('സ്വാഗതം'), false)
  assert.equal(reply.includes('https://shrox.aishopy.io'), true)
})

test('canned not-found for a bag does not say Ind saar or list shirts as stock', () => {
  const reply = buildCannedLocalizedReply({
    customerLanguage: 'Malayalam',
    scriptStyle: 'latin',
    template: 'not_found',
    facts: {
      ...facts,
      requestedItem: 'bag',
      shopSells: ['Men', 'shirts', 'pants'],
    },
  })
  assert.match(reply, /bag/i)
  assert.match(reply, /illa/i)
  assert.match(reply, /Men/)
  assert.equal(/^Ind saar/i.test(reply.trim()), false)
  assert.equal(reply.includes('Linen Shirt'), false)
  assert.equal(reply.includes('/product/'), false)
})

test('canned product wrapper after a match may say ഉണ്ട് സാർ', () => {
  const reply = buildCannedLocalizedReply({
    customerLanguage: 'Malayalam',
    scriptStyle: 'malayalam_script',
    template: 'product_lines',
    facts: { ...facts, productTitle: 'Linen Shirt' },
  })
  assert.equal(reply, 'ഉണ്ട് സാർ')
})

test('canned alternative names what is missing and what we have', () => {
  const reply = buildCannedLocalizedReply({
    customerLanguage: 'Malayalam',
    scriptStyle: 'malayalam_script',
    template: 'alternative',
    facts: { ...facts, requestedItem: 'kurta', offeredItem: 'shirts' },
  })
  assert.match(reply, /kurta/)
  assert.match(reply, /shirts/)
  assert.match(reply, /ഇല്ല/)
  assert.match(reply, /ഉണ്ട്/)
})

console.log('\n=== Chat with us language ===')

test('support prompt asks for English steps on Malayalam script', () => {
  const prompt = buildSupportSystemPrompt(
    { storeName: 'Shrox', plan: 'business', productCount: 3 },
    { merchantLanguage: 'Malayalam', scriptStyle: 'malayalam_script' }
  )
  assert.match(prompt, /English only/)
  assert.match(prompt, /latest question/)
  assert.equal(prompt.includes('spoken Kerala Malayalam'), false)
  assert.match(prompt, /app\.aishopy\.io/)
  assert.match(prompt, /Chat Boat/)
  assert.match(prompt, /Talk with us/)
  assert.match(prompt, /cname\.vercel-dns\.com/)
})

test('wraps English how-to with spoken lead', () => {
  const wrapped = wrapMalayalamScriptSupportReply(
    '1. Settings → Payment methods\n2. Enable COD, then Save.'
  )
  assert.ok(wrapped.startsWith(SUPPORT_MALAYALAM_LEAD))
  assert.match(wrapped, /Settings → Payment methods/)
  assert.equal(wrapped.includes('ഞങ്ങളുടെ സ്ഥാപനത്തിൽ'), false)
})

test('rejects Malayalam/Tamil how-to body and falls back to English', () => {
  assert.equal(
    isEnglishSupportBodyValid('നിങ്ങൾ AiShopy ഉപയോഗിക്കുന്നു. Settings തുറക്കുക.'),
    false
  )
  assert.equal(
    isEnglishSupportBodyValid('1. Settings → Payment methods\n2. Tap Save.'),
    true
  )
  const recovered = resolveEnglishHowToBody(
    'നിങ്ങൾ AiShopy ഉപയോഗിക്കുന്നു.',
    '1. Settings → Payment methods\n2. Tap Save.'
  )
  assert.equal(recovered.startsWith('1. Settings'), true)
  const bothBad = resolveEnglishHowToBody(
    'ഞങ്ങളുടെ സ്ഥാപനത്തിൽ ലഭ്യമാണ്.',
    'உண்டு சார் Settings'
  )
  assert.match(bothBad, /Talk with us/)
})

test('refuse close has no size or order push', () => {
  const reply = buildCannedLocalizedReply({
    customerLanguage: 'Malayalam',
    scriptStyle: 'latin',
    template: 'close',
    facts: { ...facts, sessionTopic: 'missing' },
  })
  assert.match(reply, /Sheri saar/)
  assert.equal(/size/i.test(reply), false)
  assert.equal(/order cheyy/i.test(reply), false)
  assert.equal(/trousers/i.test(reply), false)
})

test('ok after order does not restart a sale', () => {
  const reply = buildCannedLocalizedReply({
    customerLanguage: 'Malayalam',
    scriptStyle: 'latin',
    template: 'close',
    facts: { ...facts, sessionTopic: 'order' },
  })
  assert.match(reply, /ship aayal parayam/i)
  assert.equal(/size/i.test(reply), false)
  assert.equal(/trousers/i.test(reply), false)
})

test('not_sold vs sold_out canned lines differ', () => {
  const notSold = buildCannedLocalizedReply({
    customerLanguage: 'Malayalam',
    scriptStyle: 'latin',
    template: 'not_found',
    facts: {
      ...facts,
      requestedItem: 'shoes',
      missingWhy: 'not_sold',
      shopSells: ['Men', 'shirts'],
    },
  })
  assert.match(notSold, /shopil illa/i)
  const soldOut = buildCannedLocalizedReply({
    customerLanguage: 'Malayalam',
    scriptStyle: 'latin',
    template: 'not_found',
    facts: {
      ...facts,
      requestedItem: 'shoes',
      missingWhy: 'sold_out',
      shopSells: ['Men', 'shirts'],
    },
  })
  assert.match(soldOut, /stock illa/i)
})

test('language switch canned stays on the missing item', () => {
  const reply = buildCannedLocalizedReply({
    customerLanguage: 'Malayalam',
    scriptStyle: 'latin',
    template: 'language_switch',
    facts: {
      ...facts,
      requestedItem: 'shoes',
      sessionTopic: 'missing',
      missingWhy: 'not_sold',
      shopSells: ['Men', 'shirts'],
    },
  })
  assert.match(reply, /shoes/i)
  assert.equal(/^Hai saar/i.test(reply.trim()), false)
})

test('order follow-up canned answers courier from the card, not the date', () => {
  const reply = buildCannedLocalizedReply({
    customerLanguage: 'English',
    template: 'order_followup',
    facts: {
      ...facts,
      orderAsk: 'items',
      orderOutcome: 'found',
      orderFacts:
        'Order number: NOV26-3\nFulfillment: Unfulfilled\nCourier: none on this order\nPromised by: 2026-11-10\nTracking: none on this order',
    },
  })
  assert.match(reply, /delivery partner/i)
  assert.doesNotMatch(reply, /2026-11-10/)
  assert.doesNotMatch(reply, /Order number:/i)
  assert.doesNotMatch(reply, /helpline/i)
})

test('order follow-up canned uses promised-by when they asked the date', () => {
  const reply = buildCannedLocalizedReply({
    customerLanguage: 'English',
    template: 'order_followup',
    facts: {
      ...facts,
      orderAsk: 'eta',
      orderOutcome: 'found',
      orderFacts: 'Order number: NOV26-3\nFulfillment: Unfulfilled\nPromised by: 2026-11-10',
    },
  })
  assert.match(reply, /2026-11-10/)
  assert.doesNotMatch(reply, /Order number:/i)
})

test('order follow-up canned has no ippo illa', () => {
  const reply = buildCannedLocalizedReply({
    customerLanguage: 'Malayalam',
    scriptStyle: 'latin',
    template: 'order_followup',
    facts: {
      ...facts,
      orderAsk: 'eta',
      orderOutcome: 'found',
      orderFacts: 'Order number: OCT26-1\nFulfillment: Unfulfilled\nDelivery date: not on this order',
    },
  })
  assert.equal(/ippo illa/i.test(reply), false)
  assert.match(reply, /delivery date illa/i)
  assert.equal(/enthelum chodyangal/i.test(reply), false)
})

test('order wrap canned does not dump facts', () => {
  const reply = buildCannedLocalizedReply({
    customerLanguage: 'Malayalam',
    scriptStyle: 'latin',
    template: 'order_wrap',
    facts: {
      ...facts,
      orderAsk: 'full',
      orderOutcome: 'found',
      orderFacts: 'Order number: OCT26-1\nItems: Trousers',
    },
  })
  assert.equal(/Order number/i.test(reply), false)
  assert.equal(/enthelum chodyangal/i.test(reply), false)
})

test('rejects ippo illa on an order reply', () => {
  assert.equal(isHonestOrderTalk('Ippo illa saar, order details nokku', 'order_followup'), false)
  assert.equal(
    isHonestOrderTalk('Ee orderil delivery date illa saar. Ippo unfulfilled aanu.', 'order_followup'),
    true
  )
  assert.equal(isHonestOrderTalk('Order Number: OCT26-1\nPlaced On: 01 Oct', 'order_wrap'), false)
  assert.equal(
    isHonestOrderTalk('Time kittiyilla. Enthelum chodyangal undengil parayu saar!', 'order_followup'),
    false
  )
  assert.equal(
    isHonestOrderTalk(
      'Ithu 2-3 divasam karyam aakum saar.',
      'order_followup',
      'Promised by: not set — do not invent a date\nUsual shop delivery days: not set — do not invent a number',
    ),
    false
  )
})

test('product closing cannot claim the order already went out', () => {
  assert.equal(isHonestProductClosing("I'll get that sent out for you. Thank you for choosing Shrox!"), false)
  assert.equal(isHonestProductClosing('Order cheyyano saar?'), true)
})

test('English replies reject leftover Manglish', () => {
  assert.equal(
    isReplyScriptValid('Ningalude order kittiyathayi thirichu paranjal, njan update cheyyum saar.', 'English'),
    false
  )
  assert.equal(isReplyScriptValid('Your order has no delivery date yet. I will update you when it ships.', 'English'), true)
})

test('hi during an open product visit is a short hello', () => {
  const reply = buildCannedLocalizedReply({
    customerLanguage: 'English',
    template: 'greeting',
    facts: {
      storeName: 'Shrox',
      homeUrl: 'https://shrox.aishopy.io',
      shopSells: ['shirts', 'pants'],
      sessionTopic: 'product',
    },
  })
  assert.match(reply, /Shrox/i)
  assert.doesNotMatch(reply, /shirts, pants/i)
  assert.doesNotMatch(reply, /aishopy\.io/i)
})

test('cancel canned does not say cancelled', () => {
  const reply = buildCannedLocalizedReply({
    customerLanguage: 'Malayalam',
    scriptStyle: 'latin',
    template: 'order_help',
    facts: { ...facts, orderAsk: 'cancel' },
  })
  assert.equal(/cancelled/i.test(reply), false)
  assert.match(reply, /cancel cheyyan pattilla/i)
})

test('support prompt matches Manglish', () => {
  const prompt = buildSupportSystemPrompt(
    { storeName: 'Shrox', plan: 'business', productCount: 3 },
    { merchantLanguage: 'Malayalam', scriptStyle: 'latin' }
  )
  assert.match(prompt, /Manglish/)
})

console.log('\n=== Yes to our offer is not an order ===')

const OFFER_URL =
  'https://shrox.aishopy.io/product/force-men-printed-round-neck-cotton-blend-black-t-shirt-21?variant=117&src=wa_1009'

test('canned buy reply sends the variant link and never thanks for an order', () => {
  for (const [lang, style] of [
    ['English', undefined],
    ['Malayalam', 'latin'],
    ['Malayalam', 'malayalam_script'],
  ] as const) {
    const reply = buildCannedLocalizedReply({
      customerLanguage: lang,
      scriptStyle: style,
      template: 'buy_assist',
      facts: {
        ...facts,
        sessionTopic: 'product',
        lastShownProduct: { title: 'Force Men Printed Round Neck Cotton Blend Black T Shirt', url: OFFER_URL },
      },
    })
    assert.ok(reply.includes(OFFER_URL), `${lang} ${style}: ${reply}`)
    assert.doesNotMatch(reply, /Shall I help you order|Order cheyyano|ഓർഡർ ചെയ്യണോ/i)
    assert.doesNotMatch(reply, /Yes sir, we have it/i)
    assert.doesNotMatch(reply, /₹|Rs\.?\s*\d/)
    assert.match(reply, /open this link|Ee link open|ലിങ്ക് തുറക്കൂ/i)
    assert.equal(isHonestNoOrderTalk(reply, 'buy_assist', { sessionTopic: 'product' }), true, reply)
  }
})

test('a fake order confirmation is rejected unless an order exists', () => {
  const fake =
    "Great, sir! I'll get the Force Men Printed Round Neck Cotton Blend Black T-Shirt ready for you. We will update you when it ships. Thank you for your order!"
  for (const template of ['acknowledgement', 'buy_assist', 'close', 'product_lines'] as const) {
    assert.equal(isHonestNoOrderTalk(fake, template, { sessionTopic: 'product' }), false, template)
  }
  assert.equal(isHonestNoOrderTalk('Order aayi saar, ship aayal parayam.', 'acknowledgement', {}), false)
  assert.equal(
    isHonestNoOrderTalk('Alright sir, I will message you when it ships.', 'close', { sessionTopic: 'order' }),
    true
  )
  assert.equal(
    isHonestNoOrderTalk('We will update you when it ships.', 'acknowledgement', {
      orderFacts: 'Order number: JAN26-3',
    }),
    true
  )
  assert.equal(
    isHonestNoOrderTalk('Great sir! Tap the link to place the order.', 'buy_assist', { sessionTopic: 'product' }),
    true
  )
  assert.equal(isHonestProductClosing('Thank you for your order!'), false)
})

test('an English reply never opens with Ind saar', () => {
  assert.equal(
    isReplyScriptValid('Ind saar, we have the black T-shirt in size S available for you.', 'English'),
    false
  )
  assert.equal(isReplyScriptValid('Yes sir, we have it in size S.', 'English'), true)
  assert.equal(isReplyScriptValid('Ind saar, size S und.', 'Malayalam', 'latin'), true)
})

if (failed > 0) {
  console.error(`\n${failed} fixture(s) failed validation`)
  process.exit(1)
}

console.log('\nAll Malayalam reply fixtures passed.')
