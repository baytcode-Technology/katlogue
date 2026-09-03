import { completeJson, completeWithFallback } from '../../../shared/llm/index.js'
import {
  buildShopOwnerSystemPrompt,
  isMalayalam,
  resolveHonorific,
  type ShopOwnerTemplateTask,
} from '../prompts/shop-owner-persona.js'
import type { ScriptStyle } from './parse-customer-intent.service.js'

export type LocalizedReplyTemplate = ShopOwnerTemplateTask

export type LastShownProduct = {
  title: string
  url: string | null
}

export type LocalizedReplyFacts = {
  storeName: string
  homeUrl: string
  requestedItem?: string | null
  availableProducts?: string[]
  refusalReason?: 'explicit' | 'code_request' | 'off_topic' | 'language_meta'
  orderFacts?: string | null
  customerAsk?: string | null
  orderOutcome?: 'found' | 'none' | 'needs_phone' | null
  /** latest | all | specific | product — controls how the reply should list orders */
  orderScope?: 'latest' | 'all' | 'specific' | 'product' | null
  /** Product we last sent, so reactions like "ok" can be answered in context. */
  lastShownProduct?: LastShownProduct | null
  /** Product being sent right now, used by the product_lines task. */
  productTitle?: string | null
  hasOtherOptions?: boolean
}

/**
 * Canned wording per language, used when the model fails or answers in the wrong
 * script. Previously every failure fell back to English, so Malayalam customers
 * silently received English replies.
 */
type PhraseSet = {
  honorific: string
  welcome: (storeName: string) => string
  ourStore: string
  whatLooking: string
  ackThanks: string
  askSizeOrColor: string
  askWhatElse: string
  buyConfirm: string
  buyTapLink: string
  notFoundLead: (item: string) => string
  weHave: (items: string) => string
  browseHere: string
  refusalRedirect: (storeName: string) => string
  hereItIs: string
  closingAskSize: string
  moreOptions: string
  orderNotFound: string
  orderNeedsPhone: string
}

const EN: PhraseSet = {
  honorific: 'sir',
  welcome: (storeName) => `Hello sir, welcome to ${storeName}.`,
  ourStore: 'Our store',
  whatLooking: 'What are you looking for?',
  ackThanks: 'Thank you sir.',
  askSizeOrColor: 'Which size and colour do you need?',
  askWhatElse: 'What else would you like to see?',
  buyConfirm: 'Sure sir, we can arrange that.',
  buyTapLink: 'Tap the link to place the order',
  notFoundLead: (item) => `We don't keep ${item} sir.`,
  weHave: (items) => `We have ${items}.`,
  browseHere: 'Browse here',
  refusalRedirect: (storeName) => `What can I help you find at ${storeName} sir?`,
  hereItIs: 'Here it is sir.',
  closingAskSize: 'Which size do you need?',
  moreOptions: 'We have more options too:',
  orderNotFound:
    'Sorry sir, I could not find that order on this WhatsApp number. When did you place it, or which number did you use? I will check again.',
  orderNeedsPhone:
    'Order status can only be checked on WhatsApp using the phone number you used when ordering. Please message us from that number sir.',
}

const ML: PhraseSet = {
  honorific: 'സാർ',
  welcome: (storeName) => `നമസ്കാരം സാർ, ${storeName}-ലേക്ക് സ്വാഗതം.`,
  ourStore: 'ഞങ്ങളുടെ സ്റ്റോർ',
  whatLooking: 'എന്താണ് വേണ്ടത് സാർ?',
  ackThanks: 'നന്ദി സാർ.',
  askSizeOrColor: 'ഏത് സൈസ്, ഏത് കളർ വേണം സാർ?',
  askWhatElse: 'വേറെ എന്താണ് നോക്കേണ്ടത് സാർ?',
  buyConfirm: 'തീർച്ചയായും സാർ, ശരിയാക്കാം.',
  buyTapLink: 'ഓർഡർ ചെയ്യാൻ ഈ ലിങ്കിൽ കയറൂ',
  notFoundLead: (item) => `${item} ഇപ്പോൾ ഇല്ല സാർ.`,
  weHave: (items) => `${items} ഉണ്ട്.`,
  browseHere: 'ഇവിടെ നോക്കൂ',
  refusalRedirect: (storeName) => `${storeName}-ൽ നിന്ന് എന്താണ് വേണ്ടത് സാർ?`,
  hereItIs: 'ഉണ്ട് സാർ, ഇതാ.',
  closingAskSize: 'ഏത് സൈസ് വേണം സാർ?',
  moreOptions: 'ഇതുപോലെ വേറെയും ഉണ്ട്:',
  orderNotFound:
    'ക്ഷമിക്കണം സാർ, ഈ വാട്സാപ്പ് നമ്പറിൽ ആ ഓർഡർ കാണുന്നില്ല. എപ്പോഴാണ് ഓർഡർ ചെയ്തത്, അല്ലെങ്കിൽ ഏത് നമ്പർ ഉപയോഗിച്ചു?',
  orderNeedsPhone:
    'ഓർഡർ ചെയ്ത സമയത്ത് ഉപയോഗിച്ച നമ്പറിൽ നിന്ന് വാട്സാപ്പിൽ മെസ്സേജ് ചെയ്താൽ മാത്രമേ ഓർഡർ വിവരം നോക്കാൻ കഴിയും സാർ.',
}

const ML_LATIN: PhraseSet = {
  honorific: 'saar',
  welcome: (storeName) => `Namaskaram saar, ${storeName}-lek swagatham.`,
  ourStore: 'Njangalude store',
  whatLooking: 'Enthaanu vendath saar?',
  ackThanks: 'Nandi saar.',
  askSizeOrColor: 'Ethu size, ethu color vendam saar?',
  askWhatElse: 'Vere enthaanu nokkendath saar?',
  buyConfirm: 'Theerchayayum saar, shariyakkam.',
  buyTapLink: 'Order cheyyan ee link il kayaru',
  notFoundLead: (item) => `${item} ippo illa saar.`,
  weHave: (items) => `${items} ind.`,
  browseHere: 'Ivide nokku',
  refusalRedirect: (storeName) => `${storeName}-il ninnu enthaanu vendath saar?`,
  hereItIs: 'Ind saar, ithaa.',
  closingAskSize: 'Ethu size vendam saar?',
  moreOptions: 'Ithupole vereyum ind:',
  orderNotFound:
    'Kshamikkanam saar, ee WhatsApp number il aa order kaanunnilla. Eppozhaanu order cheythath, allengil ethu number upayogichu?',
  orderNeedsPhone:
    'Order cheytha samayath upayogicha number il ninnu WhatsApp il message cheythal mathrame order vivaram nokkan kazhiyum saar.',
}

const HI: PhraseSet = {
  honorific: 'सर',
  welcome: (storeName) => `नमस्ते सर, ${storeName} में आपका स्वागत है।`,
  ourStore: 'हमारी दुकान',
  whatLooking: 'आपको क्या चाहिए सर?',
  ackThanks: 'धन्यवाद सर।',
  askSizeOrColor: 'कौन सा साइज़ और रंग चाहिए सर?',
  askWhatElse: 'और क्या दिखाऊं सर?',
  buyConfirm: 'जी सर, हो जाएगा।',
  buyTapLink: 'ऑर्डर करने के लिए इस लिंक पर जाएं',
  notFoundLead: (item) => `${item} अभी नहीं है सर।`,
  weHave: (items) => `हमारे पास ${items} है।`,
  browseHere: 'यहाँ देखें',
  refusalRedirect: (storeName) => `${storeName} से आपको क्या चाहिए सर?`,
  hereItIs: 'जी सर, यह देखिए।',
  closingAskSize: 'कौन सा साइज़ चाहिए सर?',
  moreOptions: 'ऐसे और भी हैं:',
  orderNotFound:
    'माफ़ कीजिए सर, इस व्हाट्सएप नंबर पर वह ऑर्डर नहीं मिला। आपने कब ऑर्डर किया था, या कौन सा नंबर इस्तेमाल किया था?',
  orderNeedsPhone:
    'ऑर्डर की जानकारी उसी नंबर से व्हाट्सएप पर मैसेज करने पर मिलेगी जिससे ऑर्डर किया था सर।',
}

const TA: PhraseSet = {
  honorific: 'சார்',
  welcome: (storeName) => `வணக்கம் சார், ${storeName}-க்கு வரவேற்கிறோம்.`,
  ourStore: 'எங்கள் கடை',
  whatLooking: 'உங்களுக்கு என்ன வேண்டும் சார்?',
  ackThanks: 'நன்றி சார்.',
  askSizeOrColor: 'எந்த சைஸ், எந்த கலர் வேண்டும் சார்?',
  askWhatElse: 'வேறு என்ன காட்டவா சார்?',
  buyConfirm: 'கண்டிப்பாக சார், ஏற்பாடு செய்கிறோம்.',
  buyTapLink: 'ஆர்டர் செய்ய இந்த லிங்கை அழுத்துங்கள்',
  notFoundLead: (item) => `${item} இப்போது இல்லை சார்.`,
  weHave: (items) => `எங்களிடம் ${items} உள்ளது.`,
  browseHere: 'இங்கே பாருங்கள்',
  refusalRedirect: (storeName) => `${storeName}-ல் உங்களுக்கு என்ன வேண்டும் சார்?`,
  hereItIs: 'இருக்கு சார், இதோ.',
  closingAskSize: 'எந்த சைஸ் வேண்டும் சார்?',
  moreOptions: 'இது போல வேறும் உள்ளது:',
  orderNotFound:
    'மன்னிக்கவும் சார், இந்த வாட்ஸ்அப் எண்ணில் அந்த ஆர்டர் கிடைக்கவில்லை. எப்போது ஆர்டர் செய்தீர்கள், அல்லது எந்த எண்ணைப் பயன்படுத்தினீர்கள்?',
  orderNeedsPhone:
    'ஆர்டர் செய்யும் போது பயன்படுத்திய எண்ணிலிருந்து வாட்ஸ்அப்பில் அனுப்பினால் மட்டுமே ஆர்டர் விவரம் பார்க்க முடியும் சார்.',
}

function resolvePhrases(language: string, scriptStyle?: ScriptStyle): PhraseSet {
  const lang = language.trim().toLowerCase()
  if (lang === 'malayalam') return scriptStyle === 'malayalam_script' ? ML : ML_LATIN
  if (lang === 'hindi') return HI
  if (lang === 'tamil') return TA
  return EN
}

function upperFirst(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text
}

function buildFallback(
  template: LocalizedReplyTemplate,
  facts: LocalizedReplyFacts,
  p: PhraseSet
): string {
  switch (template) {
    case 'greeting':
      return `${p.welcome(facts.storeName)}\n\n${p.ourStore}: ${facts.homeUrl}\n\n${p.whatLooking}`

    case 'acknowledgement': {
      const product = facts.lastShownProduct?.title
      const question = product ? p.closingAskSize : p.askWhatElse
      return `${p.ackThanks} ${question}`
    }

    case 'buy_assist': {
      const link = facts.lastShownProduct?.url ?? facts.homeUrl
      return `${p.buyConfirm} ${p.closingAskSize}\n\n${p.buyTapLink}: ${link}`
    }

    case 'not_found': {
      const item = facts.requestedItem?.trim()
      const lead = item ? p.notFoundLead(item) : ''
      const list = facts.availableProducts?.length
        ? p.weHave(facts.availableProducts.join(', '))
        : ''
      const head = upperFirst([lead, list].filter(Boolean).join(' '))
      const tail = `${p.browseHere}: ${facts.homeUrl}`
      return head ? `${head}\n\n${tail}` : `${p.whatLooking}\n\n${tail}`
    }

    case 'refusal':
      return `${p.refusalRedirect(facts.storeName)}\n\n${p.browseHere}: ${facts.homeUrl}`

    case 'product_lines':
      return p.hereItIs

    case 'order_assistant':
      if (facts.orderOutcome === 'found' && facts.orderFacts?.trim()) {
        return facts.orderFacts.trim()
      }
      return p.orderNotFound

    case 'order_needs_phone':
      return `${p.orderNeedsPhone}\n\n${p.browseHere}: ${facts.homeUrl}`
  }
}

const MALAYALAM_SCRIPT = /[\u0D00-\u0D7F]/
const TAMIL_SCRIPT = /[\u0B80-\u0BFF]/
const DEVANAGARI_SCRIPT = /[\u0900-\u097F]/

/**
 * gpt-4o-mini sometimes answers a Malayalam customer in English, or drifts into
 * Tamil. Checking the script is a cheap way to catch that before sending.
 */
function isReplyScriptValid(
  reply: string,
  language: string,
  scriptStyle?: ScriptStyle
): boolean {
  const text = reply.trim()
  if (!text) return false

  if (isMalayalam(language)) {
    if (TAMIL_SCRIPT.test(text) || DEVANAGARI_SCRIPT.test(text)) return false
    return scriptStyle === 'malayalam_script'
      ? MALAYALAM_SCRIPT.test(text)
      : !MALAYALAM_SCRIPT.test(text)
  }

  const lang = language.trim().toLowerCase()
  if (lang === 'tamil' && scriptStyle !== 'latin') {
    return TAMIL_SCRIPT.test(text) && !MALAYALAM_SCRIPT.test(text)
  }
  if (lang === 'hindi' && scriptStyle !== 'latin') {
    return DEVANAGARI_SCRIPT.test(text) && !MALAYALAM_SCRIPT.test(text)
  }

  return true
}

function buildStrictScriptReminder(language: string, scriptStyle?: ScriptStyle): string {
  if (isMalayalam(language) && scriptStyle !== 'malayalam_script') {
    return 'Write the reply in Manglish — Malayalam words spelled with English letters (e.g. "Ind saar, ethu size vendam?"). Do not use Malayalam script and do not write plain English.'
  }
  if (isMalayalam(language)) {
    return 'Write the reply in Malayalam script only (e.g. "ഉണ്ട് സാർ, ഏത് സൈസ് വേണം?"). No English sentences, no Tamil, no Hindi.'
  }
  return `Write the reply in ${language} only, using the script ${language} is normally written in.`
}

function buildFactsBlock(template: LocalizedReplyTemplate, facts: LocalizedReplyFacts): string {
  const lines = [`Store name: ${facts.storeName}`, `Store link: ${facts.homeUrl}`]

  if (facts.requestedItem) lines.push(`Item NOT available: ${facts.requestedItem}`)
  if (facts.availableProducts?.length) {
    lines.push(`Items we DO have: ${facts.availableProducts.join(', ')}`)
  }
  if (facts.refusalReason) lines.push(`Reason: ${facts.refusalReason}`)
  if (facts.customerAsk?.trim()) lines.push(`Customer asked: ${facts.customerAsk.trim()}`)
  if (facts.orderOutcome) lines.push(`Order lookup outcome: ${facts.orderOutcome}`)
  if (facts.orderScope) lines.push(`Order reply scope: ${facts.orderScope}`)
  if (facts.orderFacts?.trim()) lines.push(`Order facts:\n${facts.orderFacts.trim()}`)

  if (facts.lastShownProduct?.title) {
    lines.push(`Product we already sent them: ${facts.lastShownProduct.title}`)
    if (facts.lastShownProduct.url) {
      lines.push(`Link to that product: ${facts.lastShownProduct.url}`)
    }
  } else if (template === 'acknowledgement' || template === 'buy_assist') {
    lines.push('No product has been sent yet in this chat.')
  }

  if (facts.productTitle) {
    lines.push(
      `Product being sent now (details are added by us — do NOT write the name, price or link yourself): ${facts.productTitle}`
    )
  }
  if (template === 'product_lines') {
    lines.push(`Other options also being sent: ${facts.hasOtherOptions ? 'yes' : 'no'}`)
  }

  return lines.join('\n')
}

type LocalizedReplyInput = {
  customerLanguage: string
  scriptStyle?: ScriptStyle
  customerMessage?: string
  fallbackLanguage?: string | null
  customPrompt?: string | null
  conversationHistory?: string | null
  template: LocalizedReplyTemplate
  facts: LocalizedReplyFacts
}

function resolveLanguage(input: Omit<LocalizedReplyInput, 'template'>): string {
  return input.customerLanguage?.trim() && input.customerLanguage !== 'Unknown'
    ? input.customerLanguage.trim()
    : input.fallbackLanguage?.trim() || 'English'
}

function buildSystemPrompt(
  input: Omit<LocalizedReplyInput, 'template'>,
  lang: string,
  template: LocalizedReplyTemplate
): string {
  return buildShopOwnerSystemPrompt(
    {
      storeName: input.facts.storeName,
      homeUrl: input.facts.homeUrl,
      customerLanguage: lang,
      scriptStyle: input.scriptStyle,
      customerMessage: input.customerMessage,
      customPrompt: input.customPrompt,
      conversationHistory: input.conversationHistory,
    },
    template,
    buildFactsBlock(template, input.facts)
  )
}

export async function buildLocalizedReply(input: LocalizedReplyInput): Promise<string> {
  const lang = resolveLanguage(input)
  const systemPrompt = buildSystemPrompt(input, lang, input.template)
  const honorific = resolveHonorific(lang, input.scriptStyle)

  const attempts: string[] = [
    `Write the reply in ${lang} only. Address the customer as "${honorific}".`,
    `${buildStrictScriptReminder(lang, input.scriptStyle)} Address the customer as "${honorific}". Reply with the message text only.`,
  ]

  for (const instruction of attempts) {
    try {
      const reply = await completeWithFallback(systemPrompt, [
        { role: 'user', content: instruction },
      ])
      const trimmed = reply.trim()
      if (!trimmed || trimmed.includes('could not reach our AI')) continue
      if (!isReplyScriptValid(trimmed, lang, input.scriptStyle)) {
        console.warn(
          '[inbox-ai] reply rejected: wrong script for %s (%s), template=%s',
          lang,
          input.scriptStyle ?? 'unknown',
          input.template
        )
        continue
      }
      return trimmed
    } catch {
      // try the stricter instruction, then fall back to canned wording
    }
  }

  return buildFallback(input.template, input.facts, resolvePhrases(lang, input.scriptStyle))
}

export type ProductReplyLines = {
  intro: string
  closing: string | null
  alsoFoundHeader: string | null
}

/**
 * Intro, closing question and "more options" header in a single LLM call, so the
 * salesman-style closing question costs nothing extra compared to the old
 * separate product_intro and also_found_header calls.
 */
export async function buildProductReplyLines(
  input: Omit<LocalizedReplyInput, 'template'>
): Promise<ProductReplyLines> {
  const lang = resolveLanguage(input)
  const phrases = resolvePhrases(lang, input.scriptStyle)
  const fallback: ProductReplyLines = {
    intro: phrases.hereItIs,
    closing: phrases.closingAskSize,
    alsoFoundHeader: input.facts.hasOtherOptions ? phrases.moreOptions : null,
  }

  const systemPrompt = buildSystemPrompt(input, lang, 'product_lines')
  const honorific = resolveHonorific(lang, input.scriptStyle)

  const parsed = await completeJson<{
    intro?: string | null
    closing?: string | null
    alsoFoundHeader?: string | null
  }>(
    systemPrompt,
    `Write the JSON in ${lang} only. Address the customer as "${honorific}".`
  )

  const intro = parsed?.intro?.trim()
  if (!intro || !isReplyScriptValid(intro, lang, input.scriptStyle)) return fallback

  const closing = parsed?.closing?.trim()
  const alsoFoundHeader = parsed?.alsoFoundHeader?.trim()

  return {
    intro,
    closing:
      closing && isReplyScriptValid(closing, lang, input.scriptStyle)
        ? closing
        : fallback.closing,
    alsoFoundHeader: input.facts.hasOtherOptions
      ? alsoFoundHeader && isReplyScriptValid(alsoFoundHeader, lang, input.scriptStyle)
        ? alsoFoundHeader
        : fallback.alsoFoundHeader
      : null,
  }
}
