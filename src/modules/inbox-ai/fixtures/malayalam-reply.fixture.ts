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
  buildLocalizedReply,
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

async function testAsync(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
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

console.log('\n=== Canned Malayalam script path ===')

test('skips the model for greeting wrappers', () => {
  assert.equal(
    shouldSkipModelForMalayalamScript('Malayalam', 'malayalam_script', 'greeting'),
    true
  )
  assert.equal(
    shouldSkipModelForMalayalamScript('Malayalam', 'malayalam_script', 'product_lines'),
    true
  )
})

test('keeps the model for Manglish and for order replies', () => {
  assert.equal(shouldSkipModelForMalayalamScript('Malayalam', 'latin', 'greeting'), false)
  assert.equal(
    shouldSkipModelForMalayalamScript('Malayalam', 'malayalam_script', 'order_assistant'),
    false
  )
})

await testAsync('Malayalam-script greeting uses spoken canned lines', async () => {
  const reply = await buildLocalizedReply({
    customerLanguage: 'Malayalam',
    scriptStyle: 'malayalam_script',
    template: 'greeting',
    facts,
  })
  assert.match(reply, /ഹായ് സാർ/)
  assert.match(reply, /എന്താണ് വേണ്ടത്/)
  assert.equal(reply.includes('നമസ്കാരം'), false)
  assert.equal(reply.includes('സ്വാഗതം'), false)
  assert.equal(reply.includes('https://shrox.aishopy.io'), true)
})

await testAsync('Malayalam-script product wrapper is ഉണ്ട് സാർ', async () => {
  const reply = await buildLocalizedReply({
    customerLanguage: 'Malayalam',
    scriptStyle: 'malayalam_script',
    template: 'product_lines',
    facts: { ...facts, productTitle: 'Linen Shirt' },
  })
  assert.equal(reply, 'ഉണ്ട് സാർ')
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

test('support prompt matches Manglish', () => {
  const prompt = buildSupportSystemPrompt(
    { storeName: 'Shrox', plan: 'business', productCount: 3 },
    { merchantLanguage: 'Malayalam', scriptStyle: 'latin' }
  )
  assert.match(prompt, /Manglish/)
})

if (failed > 0) {
  console.error(`\n${failed} fixture(s) failed validation`)
  process.exit(1)
}

console.log('\nAll Malayalam reply fixtures passed.')
