import {
  hasDevanagariScript,
  hasMalayalamScript,
  hasTamilScript,
  isStiffTranslationMalayalam,
  type ScriptStyle,
} from '../../../shared/lib/detect-language-script.js'
import { completeJson, completeWithFallback } from '../../../shared/llm/index.js'
import {
  buildShopOwnerSystemPrompt,
  isMalayalam,
  resolveHonorific,
  type ShopOwnerTemplateTask,
} from '../prompts/shop-owner-persona.js'
import type { MissingWhy, OrderAsk, SessionTopic } from './parse-customer-intent.service.js'

export { isStiffTranslationMalayalam }

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
  /** Active shop categories (Men, shirts) — not a dump of product titles. */
  shopSells?: string[]
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
  /** The other item they agreed to, when the first one is not in the shop. */
  offeredItem?: string | null
  missingWhy?: MissingWhy | null
  sessionTopic?: SessionTopic
  orderAsk?: OrderAsk | null
  shopPolicyFacts?: string | null
  paymentFacts?: string | null
  shopPolicyCustomerCopy?: string | null
  paymentCustomerFacts?: string | null
  restockNote?: string | null
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
  weSell: (items: string) => string
  wantAny: string
  alternativeLead: (missing: string, offered: string) => string
  browseHere: string
  refusalRedirect: (storeName: string) => string
  hereItIs: string
  closingAskSize: string
  moreOptions: string
  orderNotFound: string
  orderNeedsPhone: string
  closeOk: string
  closeAfterOrder: string
  soldOutLead: (item: string) => string
  notSoldLead: (item: string) => string
  priceAsk: string
  orderEtaUnknown: string
  orderCannotCancel: string
  orderNotMine: string
  shipAfterOrder: string
  orderFoundLead: string
  orderStaffCheck: string
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
  weSell: (items) => `This shop has ${items}.`,
  wantAny: 'Would you like any of those?',
  alternativeLead: (missing, offered) =>
    `We don't have ${missing} sir. We have ${offered}.`,
  browseHere: 'Browse here',
  refusalRedirect: (storeName) => `What can I help you find at ${storeName} sir?`,
  hereItIs: 'Here it is sir.',
  closingAskSize: 'Shall I help you order?',
  moreOptions: 'We have more options too:',
  orderNotFound:
    'Sorry sir, I could not find that order on this WhatsApp number. When did you place it, or which number did you use? I will check again.',
  orderNeedsPhone:
    'Order status can only be checked on WhatsApp using the phone number you used when ordering. Please message us from that number sir.',
  closeOk: 'Alright sir.',
  closeAfterOrder: 'Alright sir, I will message you when it ships.',
  soldOutLead: (item) => `${item} is out of stock sir.`,
  notSoldLead: (item) => `We don't keep ${item} in this shop sir.`,
  priceAsk: 'Which item from this shop should I price for you sir?',
  orderEtaUnknown: 'No delivery date on this order yet sir. Still unfulfilled. I will update you when it ships.',
  orderCannotCancel: 'I cannot cancel or change that in chat sir. Send the order number and staff will check.',
  orderNotMine: 'If this is not your order, send the order number or the WhatsApp number used at checkout. Staff will check.',
  shipAfterOrder: 'We ship after you place the order sir. No delivery date until then.',
  orderFoundLead: 'I found your order sir.',
  orderStaffCheck: 'No delivery date on this order yet. Still unfulfilled. Staff will check.',
}

const ML: PhraseSet = {
  honorific: 'സാർ',
  welcome: (storeName) => `ഹായ് സാർ, ${storeName} ആണ്.`,
  ourStore: 'സ്റ്റോർ',
  whatLooking: 'എന്താണ് വേണ്ടത്?',
  ackThanks: 'ശരി സാർ.',
  askSizeOrColor: 'ഏത് സൈസ്, ഏത് കളർ വേണം?',
  askWhatElse: 'വേറെ എന്താണ് നോക്കേണ്ടത്?',
  buyConfirm: 'ശരി സാർ, ക്രമീകരിക്കാം.',
  buyTapLink: 'ഓർഡർ ചെയ്യാൻ ലിങ്ക് ഇതാ',
  notFoundLead: (item) => `${item} ഇപ്പോൾ ഇല്ല സാർ.`,
  weHave: (items) => `${items} ഉണ്ട്.`,
  weSell: (items) => `ഈ ഷോപ്പ് ${items} ആണ്.`,
  wantAny: 'അതിൽ എന്തെങ്കിലും വേണോ?',
  alternativeLead: (missing, offered) => `${missing} ഇപ്പോൾ ഇല്ല സാർ. ${offered} ഉണ്ട്.`,
  browseHere: 'ഇവിടെ നോക്കൂ',
  refusalRedirect: (storeName) => `${storeName}-ൽ നിന്ന് എന്താണ് വേണ്ടത്?`,
  hereItIs: 'ഉണ്ട് സാർ',
  closingAskSize: 'ഓർഡർ ചെയ്യണോ സാർ?',
  moreOptions: 'ഇതുപോലെ വേറെയും ഉണ്ട്:',
  orderNotFound:
    'ആ ഓർഡർ ഈ നമ്പറിൽ കാണുന്നില്ല സാർ. എപ്പോഴാണ് ഓർഡർ ചെയ്തത്, അല്ലെങ്കിൽ ഏത് നമ്പർ ഉപയോഗിച്ചു?',
  orderNeedsPhone:
    'ഓർഡർ ചെയ്ത നമ്പറിൽ നിന്ന് വാട്സാപ്പ് അയച്ചാൽ മാത്രമേ നോക്കാൻ പറ്റൂ സാർ.',
  closeOk: 'ശരി സാർ.',
  closeAfterOrder: 'ശരി സാർ, ഷിപ്പ് ആയാൽ പറയാം.',
  soldOutLead: (item) => `${item} സ്റ്റോക്ക് ഇല്ല സാർ.`,
  notSoldLead: (item) => `${item} ഈ ഷോപ്പിൽ ഇല്ല സാർ.`,
  priceAsk: 'ഏത് സാധനത്തിന്റെ വില വേണം സാർ?',
  orderEtaUnknown: 'ഈ ഓർഡറിൽ ഡെലിവറി തീയതി ഇല്ല സാർ. ഇപ്പോൾ unfulfilled ആണ്. ഷിപ്പ് ആയാൽ പറയാം.',
  orderCannotCancel: 'ചാറ്റിൽ ക്യാൻസൽ ചെയ്യാൻ പറ്റില്ല സാർ. ഓർഡർ നമ്പർ അയച്ചാൽ സ്റ്റാഫ് നോക്കും.',
  orderNotMine: 'ഇത് താങ്കളുടെ ഓർഡർ അല്ലെങ്കിൽ ഓർഡർ നമ്പർ അല്ലെങ്കിൽ ചെക്ക് ഔട്ട് നമ്പർ അയയ്ക്കൂ. സ്റ്റാഫ് നോക്കും.',
  shipAfterOrder: 'ഓർഡർ ചെയ്ത ശേഷമേ ഷിപ്പ് ആകൂ സാർ. അതിന് മുമ്പ് ഡെലിവറി തീയതി ഇല്ല.',
  orderFoundLead: 'ഓർഡർ കണ്ടു സാർ.',
  orderStaffCheck: 'ഈ ഓർഡറിൽ ഡെലിവറി തീയതി ഇല്ല. ഇപ്പോൾ unfulfilled ആണ്. സ്റ്റാഫ് നോക്കും.',
}

const ML_LATIN: PhraseSet = {
  honorific: 'saar',
  welcome: (storeName) => `Hai saar, ${storeName} aanu.`,
  ourStore: 'Store',
  whatLooking: 'Enthaanu vendath?',
  ackThanks: 'Sheri saar.',
  askSizeOrColor: 'Ethu size, ethu color vendam?',
  askWhatElse: 'Vere enthaanu nokkendath?',
  buyConfirm: 'Sheri saar, kramikkarikkam.',
  buyTapLink: 'Order cheyyan link ithaa',
  notFoundLead: (item) => `${item} ippo illa saar.`,
  weHave: (items) => `${items} ind.`,
  weSell: (items) => `Ee shop ${items} aanu.`,
  wantAny: 'Athil enthelum veeno?',
  alternativeLead: (missing, offered) => `${missing} ippo illa saar. ${offered} ind.`,
  browseHere: 'Ivide nokku',
  refusalRedirect: (storeName) => `${storeName}-il ninnu enthaanu vendath?`,
  hereItIs: 'Ind saar',
  closingAskSize: 'Order cheyyano saar?',
  moreOptions: 'Ithupole vereyum ind:',
  orderNotFound:
    'Aa order ee number il kaanunnilla saar. Eppozhaanu order cheythath, allengil ethu number upayogichu?',
  orderNeedsPhone:
    'Order cheytha number il ninnu WhatsApp ayachal mathrame nokkan pattu saar.',
  closeOk: 'Sheri saar.',
  closeAfterOrder: 'Sheri saar, ship aayal parayam.',
  soldOutLead: (item) => `${item} stock illa saar.`,
  notSoldLead: (item) => `${item} ee shopil illa saar.`,
  priceAsk: 'Ethu iteminte vila venam saar?',
  orderEtaUnknown:
    'Ee orderil delivery date illa saar. Ippo unfulfilled aanu. Ship aayal parayam.',
  orderCannotCancel:
    'Chatil cancel cheyyan pattilla saar. Order number ayachal staff nokkum.',
  orderNotMine:
    'Ithu ningalude order allengil order number allengil checkout number ayakku. Staff nokkum.',
  shipAfterOrder: 'Order cheytha shesham ship aakum saar. Athinu munp delivery date illa.',
  orderFoundLead: 'Order kandi saar.',
  orderStaffCheck: 'Ee orderil delivery date illa. Ippo unfulfilled aanu. Staff nokkum.',
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
  weSell: (items) => `यह दुकान ${items} की है।`,
  wantAny: 'इनमें से कुछ देखना है?',
  alternativeLead: (missing, offered) => `${missing} नहीं है सर। ${offered} है।`,
  browseHere: 'यहाँ देखें',
  refusalRedirect: (storeName) => `${storeName} से आपको क्या चाहिए सर?`,
  hereItIs: 'जी सर, यह देखिए।',
  closingAskSize: 'ऑर्डर कर दूँ सर?',
  moreOptions: 'ऐसे और भी हैं:',
  orderNotFound:
    'माफ़ कीजिए सर, इस व्हाट्सएप नंबर पर वह ऑर्डर नहीं मिला। आपने कब ऑर्डर किया था, या कौन सा नंबर इस्तेमाल किया था?',
  orderNeedsPhone:
    'ऑर्डर की जानकारी उसी नंबर से व्हाट्सएप पर मैसेज करने पर मिलेगी जिससे ऑर्डर किया था सर।',
  closeOk: 'ठीक है सर।',
  closeAfterOrder: 'ठीक है सर, शिप होते ही बताऊँगा।',
  soldOutLead: (item) => `${item} स्टॉक में नहीं है सर।`,
  notSoldLead: (item) => `${item} इस दुकान में नहीं रखते सर।`,
  priceAsk: 'किस चीज़ की कीमत बताऊँ सर?',
  orderEtaUnknown: 'इस ऑर्डर पर डिलीवरी तारीख नहीं है सर। अभी unfulfilled है। शिप होते ही बताऊँगा।',
  orderCannotCancel: 'चैट में कैंसल नहीं कर सकता सर। ऑर्डर नंबर भेजिए, स्टाफ देखेगा।',
  orderNotMine: 'अगर यह आपका ऑर्डर नहीं है तो ऑर्डर नंबर या चेकआउट वाला नंबर भेजिए। स्टाफ देखेगा।',
  shipAfterOrder: 'ऑर्डर के बाद ही शिप होगा सर। उससे पहले डिलीवरी तारीख नहीं है।',
  orderFoundLead: 'ऑर्डर मिल गया सर।',
  orderStaffCheck: 'इस ऑर्डर पर डिलीवरी तारीख नहीं है। अभी unfulfilled है। स्टाफ देखेगा।',
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
  weSell: (items) => `இந்த கடை ${items}.`,
  wantAny: 'இதில் ஏதாவது வேண்டுமா?',
  alternativeLead: (missing, offered) => `${missing} இல்லை சார். ${offered} உள்ளது.`,
  browseHere: 'இங்கே பாருங்கள்',
  refusalRedirect: (storeName) => `${storeName}-ல் உங்களுக்கு என்ன வேண்டும் சார்?`,
  hereItIs: 'இருக்கு சார், இதோ.',
  closingAskSize: 'ஆர்டர் செய்யட்டுமா சார்?',
  moreOptions: 'இது போல வேறும் உள்ளது:',
  orderNotFound:
    'மன்னிக்கவும் சார், இந்த வாட்ஸ்அப் எண்ணில் அந்த ஆர்டர் கிடைக்கவில்லை. எப்போது ஆர்டர் செய்தீர்கள், அல்லது எந்த எண்ணைப் பயன்படுத்தினீர்கள்?',
  orderNeedsPhone:
    'ஆர்டர் செய்யும் போது பயன்படுத்திய எண்ணிலிருந்து வாட்ஸ்அப்பில் அனுப்பினால் மட்டுமே ஆர்டர் விவரம் பார்க்க முடியும் சார்.',
  closeOk: 'சரி சார்.',
  closeAfterOrder: 'சரி சார், ஷிப் ஆனால் சொல்கிறேன்.',
  soldOutLead: (item) => `${item} ஸ்டாக் இல்லை சார்.`,
  notSoldLead: (item) => `${item} இந்த கடையில் இல்லை சார்.`,
  priceAsk: 'எந்த பொருளின் விலை வேண்டும் சார்?',
  orderEtaUnknown: 'இந்த ஆர்டரில் டெலிவரி தேதி இல்லை சார். இப்போது unfulfilled. ஷிப் ஆனால் சொல்கிறேன்.',
  orderCannotCancel: 'சாட்டில் கேன்சல் செய்ய முடியாது சார். ஆர்டர் நம்பர் அனுப்பினால் ஸ்டாப் பார்க்கும்.',
  orderNotMine: 'இது உங்கள் ஆர்டர் இல்லையென்றால் ஆர்டர் நம்பர் அல்லது செக் அவுட் நம்பர் அனுப்புங்கள். ஸ்டாப் பார்க்கும்.',
  shipAfterOrder: 'ஆர்டர் செய்த பிறகுதான் ஷிப் ஆகும் சார். அதற்கு முன் டெலிவரி தேதி இல்லை.',
  orderFoundLead: 'ஆர்டர் கிடைத்தது சார்.',
  orderStaffCheck: 'இந்த ஆர்டரில் டெலிவரி தேதி இல்லை. இப்போது unfulfilled. ஸ்டாப் பார்க்கும்.',
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
    case 'greeting': {
      const sells = facts.shopSells?.filter(Boolean) ?? []
      const ask = sells.length > 0 ? `${p.weSell(sells.join(', '))} ${p.wantAny}` : p.whatLooking
      return `${p.welcome(facts.storeName)}\n\n${p.ourStore}: ${facts.homeUrl}\n\n${ask}`
    }

    case 'acknowledgement': {
      if (facts.sessionTopic === 'order') return p.closeAfterOrder
      const product = facts.lastShownProduct?.title
      const question = product ? p.closingAskSize : p.askWhatElse
      return `${p.ackThanks} ${question}`
    }

    case 'close':
      if (facts.sessionTopic === 'order') return p.closeAfterOrder
      if (facts.sessionTopic === 'product') return p.shipAfterOrder
      return p.closeOk

    case 'language_switch': {
      const item = facts.requestedItem?.trim()
      if (facts.sessionTopic === 'order') return p.closeAfterOrder
      if (item && facts.missingWhy === 'sold_out') {
        return `${p.soldOutLead(item)} ${p.weSell((facts.shopSells ?? []).join(', '))} ${p.wantAny}`
      }
      if (item) {
        return `${p.notSoldLead(item)} ${p.weSell((facts.shopSells ?? []).join(', '))} ${p.wantAny}`
      }
      return p.closeOk
    }

    case 'shop_info': {
      const policies = facts.shopPolicyCustomerCopy?.trim()
      const payments = facts.paymentCustomerFacts?.trim()
      const body = [policies, payments].filter(Boolean).join('\n')
      return body
        ? `${p.ackThanks}\n\n${body}\n\n${p.browseHere}: ${facts.homeUrl}`
        : `${p.ackThanks} Staff will check and reply.\n\n${p.browseHere}: ${facts.homeUrl}`
    }

    case 'price_ask': {
      const sells = facts.shopSells?.filter(Boolean) ?? []
      const list = sells.length > 0 ? p.weSell(sells.join(', ')) : ''
      return `${p.priceAsk} ${list}`.trim()
    }

    case 'buy_assist': {
      const link = facts.lastShownProduct?.url ?? facts.homeUrl
      return `${p.buyConfirm} ${p.closingAskSize}\n\n${p.buyTapLink}: ${link}`
    }

    case 'not_found': {
      const item = facts.requestedItem?.trim()
      const lead = item
        ? facts.missingWhy === 'sold_out'
          ? p.soldOutLead(item)
          : p.notSoldLead(item)
        : ''
      const sells = facts.shopSells?.filter(Boolean) ?? []
      const list = sells.length > 0 ? `${p.weSell(sells.join(', '))} ${p.wantAny}` : ''
      const head = upperFirst([lead, list].filter(Boolean).join(' '))
      const tail = `${p.browseHere}: ${facts.homeUrl}`
      return head ? `${head}\n\n${tail}` : `${p.whatLooking}\n\n${tail}`
    }

    case 'alternative': {
      const missing = facts.requestedItem?.trim() || 'that'
      const offered = facts.offeredItem?.trim() || 'other options'
      return p.alternativeLead(missing, offered)
    }

    case 'refusal':
      return `${p.refusalRedirect(facts.storeName)}\n\n${p.browseHere}: ${facts.homeUrl}`

    case 'product_lines':
      return p.hereItIs

    case 'order_assistant':
    case 'order_wrap':
      if (facts.orderOutcome === 'found') return p.orderFoundLead
      return p.orderNotFound

    case 'order_followup': {
      if (facts.orderOutcome !== 'found') return p.orderNotFound
      if (facts.orderAsk === 'confirm_last' && facts.orderFacts?.trim()) {
        const number = facts.orderFacts.match(/Order number:\s*(\S+)/i)?.[1]
        return number
          ? `Yes ${p.honorific}, that is your last order ${number}.`
          : p.orderStaffCheck
      }
      return p.orderStaffCheck
    }

    case 'order_help':
      if (facts.orderAsk === 'not_mine') return p.orderNotMine
      return p.orderCannotCancel

    case 'order_needs_phone':
      return `${p.orderNeedsPhone}\n\n${p.browseHere}: ${facts.homeUrl}`
  }
}

/** Model writes shop talk. Canned wording is only used if the model fails. */
export function shouldSkipModelForMalayalamScript(
  _language: string,
  _scriptStyle: ScriptStyle | undefined,
  _template: LocalizedReplyTemplate
): boolean {
  return false
}

const STOCK_CLAIM_PATTERN =
  /^(ind saar|undu saar|stock ind|ഉണ്ട് സാർ|സ്റ്റോക്ക് ഉണ്ട്)/i

export function isHonestStockTalk(
  reply: string,
  template: LocalizedReplyTemplate
): boolean {
  if (
    template !== 'not_found' &&
    template !== 'greeting' &&
    template !== 'alternative' &&
    template !== 'language_switch'
  ) {
    return true
  }
  const first = reply.trim().split(/[.!\n]/)[0]?.trim() ?? ''
  if (!STOCK_CLAIM_PATTERN.test(first)) return true
  return /\b(illa|ill|ഇല്ല)\b/i.test(first)
}

const ORDER_STOCK_MISS_PATTERN = /\b(ippo illa|ഇപ്പോൾ ഇല്ല|out of stock)\b/i
const ORDER_COPIED_FACTS_PATTERN =
  /\bOrder Number\s*:/i
const ORDER_FORCED_QUESTION_PATTERN =
  /\b(enthelum chodyangal|any (other )?questions|proceed with the order|need any details about the trousers)\b/i

export function isHonestOrderTalk(reply: string, template: LocalizedReplyTemplate): boolean {
  if (
    template !== 'order_assistant' &&
    template !== 'order_wrap' &&
    template !== 'order_followup' &&
    template !== 'order_help'
  ) {
    return true
  }
  if (ORDER_STOCK_MISS_PATTERN.test(reply)) return false
  if (ORDER_COPIED_FACTS_PATTERN.test(reply)) return false
  if (ORDER_FORCED_QUESTION_PATTERN.test(reply)) return false
  return true
}

/**
 * gpt-4o-mini sometimes answers a Malayalam customer in English, or drifts into
 * Tamil / stiff textbook Malayalam. Checking the script is a cheap way to catch
 * that before sending.
 */
export function isReplyScriptValid(
  reply: string,
  language: string,
  scriptStyle?: ScriptStyle
): boolean {
  const text = reply.trim()
  if (!text) return false

  if (isMalayalam(language)) {
    if (hasTamilScript(text) || hasDevanagariScript(text)) return false
    if (scriptStyle === 'malayalam_script') {
      return hasMalayalamScript(text) && !isStiffTranslationMalayalam(text)
    }
    return !hasMalayalamScript(text)
  }

  const lang = language.trim().toLowerCase()
  if (lang === 'tamil' && scriptStyle !== 'latin') {
    return hasTamilScript(text) && !hasMalayalamScript(text)
  }
  if (lang === 'hindi' && scriptStyle !== 'latin') {
    return hasDevanagariScript(text) && !hasMalayalamScript(text)
  }

  return true
}

function buildStrictScriptReminder(language: string, scriptStyle?: ScriptStyle): string {
  if (isMalayalam(language) && scriptStyle !== 'malayalam_script') {
    return 'Write the reply in Manglish — Malayalam words spelled with English letters. Do not use Malayalam script and do not write plain English. Do not open with "Ind saar" unless the facts confirm we have a matching product.'
  }
  if (isMalayalam(language)) {
    return 'Write the reply in Malayalam script only. No English sentences, no Tamil, no Hindi. Do not open with "ഉണ്ട് സാർ" unless the facts confirm we have a matching product.'
  }
  return `Write the reply in ${language} only, using the script ${language} is normally written in.`
}

function buildFactsBlock(template: LocalizedReplyTemplate, facts: LocalizedReplyFacts): string {
  const lines = [`Store name: ${facts.storeName}`, `Store link: ${facts.homeUrl}`]

  if (facts.requestedItem) lines.push(`Item NOT available: ${facts.requestedItem}`)
  if (facts.offeredItem) lines.push(`Offering instead: ${facts.offeredItem}`)
  if (facts.shopSells?.length) {
    lines.push(`This shop sells (categories only — do not invent products): ${facts.shopSells.join(', ')}`)
  }
  if (facts.availableProducts?.length) {
    lines.push(`Named alternatives we can send: ${facts.availableProducts.join(', ')}`)
  }
  if (facts.refusalReason) lines.push(`Reason: ${facts.refusalReason}`)
  if (facts.customerAsk?.trim()) lines.push(`Customer asked: ${facts.customerAsk.trim()}`)
  if (facts.orderOutcome) lines.push(`Order lookup outcome: ${facts.orderOutcome}`)
  if (facts.orderScope) lines.push(`Order reply scope: ${facts.orderScope}`)
  if (facts.missingWhy) lines.push(`Missing why: ${facts.missingWhy}`)
  if (facts.sessionTopic) lines.push(`Last shop topic: ${facts.sessionTopic}`)
  if (facts.shopPolicyFacts?.trim()) lines.push(`Shop policies:\n${facts.shopPolicyFacts.trim()}`)
  if (facts.paymentFacts?.trim()) lines.push(`Payment methods:\n${facts.paymentFacts.trim()}`)
  if (facts.restockNote?.trim()) {
    lines.push(`Restock note (use only if why=sold_out): ${facts.restockNote.trim()}`)
  }
  if (facts.orderAsk) lines.push(`Order ask: ${facts.orderAsk}`)
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

export function buildCannedLocalizedReply(input: LocalizedReplyInput): string {
  const lang = resolveLanguage(input)
  return buildFallback(input.template, input.facts, resolvePhrases(lang, input.scriptStyle))
}

export async function buildLocalizedReply(input: LocalizedReplyInput): Promise<string> {
  const lang = resolveLanguage(input)
  const canned = buildCannedLocalizedReply(input)

  if (shouldSkipModelForMalayalamScript(lang, input.scriptStyle, input.template)) {
    return canned
  }

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
      if (!isHonestStockTalk(trimmed, input.template)) {
        console.warn('[inbox-ai] reply rejected: claimed stock on %s', input.template)
        continue
      }
      if (!isHonestOrderTalk(trimmed, input.template)) {
        console.warn('[inbox-ai] reply rejected: stock talk on order %s', input.template)
        continue
      }
      return trimmed
    } catch {
      // try the stricter instruction, then fall back to canned wording
    }
  }

  return canned
}

export function staffClosingLine(language: string, scriptStyle?: ScriptStyle): string {
  return resolvePhrases(language, scriptStyle).closingAskSize
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

  if (shouldSkipModelForMalayalamScript(lang, input.scriptStyle, 'product_lines')) {
    return fallback
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
