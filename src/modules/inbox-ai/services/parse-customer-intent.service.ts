import { completeJson } from '../../../shared/llm/index.js'

export type CustomerIntent =
  | 'greeting'
  | 'acknowledgement'
  | 'buy_intent'
  | 'product_search'
  | 'sku_lookup'
  | 'category_search'
  | 'image_request'
  | 'order_status'
  | 'off_topic'
  | 'explicit'

export type OrderScope = 'latest' | 'all' | 'specific' | 'product' | null

/**
 * Script the customer typed in. Manglish (Malayalam written with Latin letters)
 * must be answered in Manglish, not Malayalam script.
 */
export type ScriptStyle = 'malayalam_script' | 'latin' | 'other'

/** Intents that carry no product to look up in the catalog. */
const NON_CATALOG_INTENTS: ReadonlySet<CustomerIntent> = new Set<CustomerIntent>([
  'acknowledgement',
  'buy_intent',
  'order_status',
])

export type ParsedCustomerIntent = {
  intent: CustomerIntent
  customerLanguage: string
  scriptStyle: ScriptStyle
  requestedItem: string | null
  searchQuery: string
  color: string | null
  size: string | null
  sku: string | null
  categoryName: string | null
  wantsImage: boolean
  orderNumber: string | null
  orderNumberHint: string | null
  orderProductHint: string | null
  orderScope: OrderScope
  typedPhone: string | null
  /** Set when message is off-topic due to language-capability questions */
  offTopicReason?: 'language_meta' | 'general' | null
}

export type ConversationHistoryLine = {
  role: 'customer' | 'store'
  text: string
}

export type ParseCustomerIntentOptions = {
  recentMessages?: ConversationHistoryLine[]
}

export type LlmIntentResult = {
  intent?: CustomerIntent
  customerLanguage?: string
  requestedItem?: string | null
  searchQuery?: string
  color?: string | null
  size?: string | null
  sku?: string | null
  categoryName?: string | null
  wantsImage?: boolean
  orderNumber?: string | null
  orderNumberHint?: string | null
  orderProductHint?: string | null
  orderScope?: OrderScope
  typedPhone?: string | null
}

const INTENT_SCHEMA = `You classify customer messages for a store WhatsApp/Instagram inbox.

CRITICAL — Language:
- Detect the EXACT language the customer wrote in.
- Malayalam script or words → customerLanguage: "Malayalam" (NOT Tamil)
- Tamil script or words → customerLanguage: "Tamil"
- Mixed English + Malayalam → customerLanguage: "Malayalam" (or note mixed — still reply in their mix)
- NEVER assign Tamil if they wrote Malayalam. NEVER assign a different language than what the customer used.
- Manglish (Malayalam typed with English letters) is still Malayalam → customerLanguage: "Malayalam".
  Manglish markers: undo, undu, ond, illa, ille, aanu, aahn, vendam, vehnam, ethra, vila, kittumo, ayakkavo, cheyyam, edukkam, koodi, ulla, entha.
  "blue shirt undo?" → customerLanguage: "Malayalam" (NOT English).

CRITICAL — Extract product only:
- IGNORE personal stories, events, reasons (wedding, party, tomorrow, gift, birthday, etc.)
- "വെള്ള shirt ഉണ്ടോ?" → product_search, searchQuery: "shirt", color: "white", customerLanguage: "Malayalam"
- "blue shirt undo?" → product_search, searchQuery: "shirt", color: "blue", requestedItem: "blue shirt"
- Pairing / owned-item context: "I have a green shirt, need pants to pair / send pant images" → searchQuery: "pants", categoryName: "pants", color: null. Do NOT search for the item they already own.
- "ente kayyil oru green shirt ond … pantsinte images ayackavo" → searchQuery: "pants", categoryName: "pants", color: null.
- Latest message product type ALWAYS overrides prior conversation. If they talked about shirts and now ask for pants, searchQuery is "pants" — never keep "shirt".
- Follow-ups: if they previously asked about shirts and now say ONLY "white?" or "വെള്ള?" with no new product type → product_search, color: "white", searchQuery: "shirt"
- Only extract what product they want to buy.

Normalize product search terms to English for database lookup.

Return JSON only:
{
  "intent": "greeting" | "acknowledgement" | "buy_intent" | "product_search" | "sku_lookup" | "category_search" | "image_request" | "order_status" | "off_topic" | "explicit",
  "customerLanguage": "exact language name e.g. English, Hindi, Malayalam, Tamil, Punjabi, Arabic",
  "requestedItem": "product they want in English e.g. white shirt, or null",
  "searchQuery": "English product terms without color/size e.g. shirt",
  "color": "English color e.g. white, black, or null",
  "size": "S, M, L, XL, or null",
  "sku": "SKU if mentioned or null",
  "categoryName": "English category e.g. shirts, pants, or null",
  "wantsImage": true if they ask for photo/image,
  "orderNumber": "full order number e.g. JAN26-3 if mentioned, or null",
  "orderNumberHint": "bare digits after order e.g. 88 from 'order 88', or null",
  "orderProductHint": "product name in an order question e.g. shirt, or null",
  "orderScope": "latest" | "all" | "specific" | "product" | null,
  "typedPhone": "a 10-15 digit phone the customer typed, or null"
}

Rules:
- acknowledgement: the customer is only reacting, not asking for a new product. "ok", "okay", "k", "ok sir", "thanks", "thank you", "super", "nice", "good", "got it", "fine", "mm", "hmm", "ശരി", "sheri", "ok saar", "adipoli", or emoji only.
  For acknowledgement ALWAYS return searchQuery: "", color: null, categoryName: null, requestedItem: null — even if earlier messages were about shirts. Do NOT repeat the previous product.
  "ok" → intent: "acknowledgement", searchQuery: "". NEVER product_search.
  "ok" is an acknowledgement even right after we sent a product — they are reacting to that product.
  But "ok blue shirt undo?" mentions a NEW product → product_search, searchQuery: "shirt", color: "blue".
- buy_intent: the customer wants to buy or order what was already discussed, without naming a new product. "I'll take it", "ok I want this", "how to order", "order cheyyam", "order cheyyan pattumo", "book it", "edukkam", "എടുക്കാം", "വേണം" alone, "how to pay", "cash on delivery undo".
  For buy_intent ALSO return searchQuery: "", categoryName: null. Keep size/color if they stated one (e.g. "L edukkam" → size: "L").
- Any product availability, price, or shopping question = product_search (NOT off_topic), even with personal context.
- order_status for: my/last/recent order, all/total orders, order status, tracking, shipped, delivery, payment status, where is my order, "order evide", "kittiyilla", "ordered today" — NOT product_search or off_topic.
- "where is my shirt order" → order_status, orderScope: "product", orderProductHint: "shirt", searchQuery: "".
- "status of order JAN26-5" → order_status, orderScope: "specific", orderNumber: "JAN26-5".
- "order 88" / "order 10" → order_status, orderNumberHint: "88" or "10", orderScope: "specific".
- "my last order" / "last order status" / "ente last order" → order_status, orderScope: "latest".
- "all my orders" / "my orders" / "total orders" / "how many orders" / "ella orders" / "orders okke" / "ente orders ellam" → order_status, orderScope: "all".
- "where is my order" (no last/all) → order_status, orderScope: "latest".
- Messages in any language about products = product_search (unless clearly about an existing order).
- off_topic for: "do you know Malayalam?", "can you speak Hindi?", reading PDFs/files, general knowledge, app/code questions, unrelated chat — NO shopping intent.
- explicit only for sexual/violent/harassing content.`

const GREETING_PATTERN =
  /^(hi|hello|hey|hii|helo|good\s+(morning|afternoon|evening)|namaste|vanakkam|hola|assalam|salam|നമസ്കാരം|ഹലോ|നമസ്കാര|नमस्ते|হ্যালো)\b/i

/**
 * Pure reactions with no new product ask. Anchored so "ok blue shirt undo?"
 * still reaches product_search.
 */
const ACK_PATTERN =
  /^(ok|oke?y|okk+|k|kk|ack|ss|mm+|hm+|sheri|seri|thanks?|thank\s*you|thx|ty|tnx|nice|super|good|great|cool|fine|got\s*it|understood|adipoli|kollam|balle|ശരി|നന്ദി|കൊള്ളാം|അടിപൊളി|ठीक|शुक्रिया|சரி|நன்றி)[\s.!,👍🙏😊😀🙂❤️✅]*(ok|okay|sir|saar|sar|chetta|chechi|bro|madam|സാർ|ചേട്ടാ|ചേച്ചി)?[\s.!,👍🙏😊😀🙂❤️✅]*$/i

/** Emoji / punctuation only messages are reactions too. */
const EMOJI_ONLY_PATTERN =
  /^[\s.!,?👍🙏😊😀🙂😍🥰❤️💖✅🔥👌💯🤝😅😂🎉⭐️✨]+$/u

/** Wants to buy / order what was already shown, without naming a new product. */
const BUY_INTENT_PATTERN =
  /\b(how\s+(do\s+i|to|can\s+i)\s+(order|buy|pay)|i(?:'| a)?ll?\s+take\s+(it|this)|i\s+want\s+(it|this)|book\s+(it|this)|place\s+(the\s+)?order|order\s+cheyy?(am|aam|an|anam|umo|ano)|order\s+cheyyan\s+pattum(o)?|edukk?(am|aam|ano|umo)|vaangan|vangam|cash\s+on\s+delivery|\bcod\b|online\s+payment|delivery\s+charge|free\s+delivery)\b|എടുക്കാം|ഓർഡർ\s*ചെയ്യ|വാങ്ങ/i

/**
 * Manglish = Malayalam typed with Latin letters. Detected separately from
 * Unicode script so these customers get a Manglish reply, not English.
 */
const MANGLISH_PATTERN =
  /\b(undo|undu|und|ond|onde|olla|ulla|illa|ille|aanu|aahn|aan|aano|vendam|vehnam|venam|vendath|ethra|ethrayaanu|vila|kittumo|kitteela|kittiyilla|ayakkavo|ayackavo|ayakku|cheyyam|cheyyan|cheyyamo|edukkam|koodi|entha|enthu|enik+|enick|ente|njan|ningal|pattiya|pattumo|sheri|seri|mathi|thaa|tharumo|adipoli|kollam|evide|eppo|ippo|sadhanam|saadhanam)\b/i

const LANGUAGE_META_PATTERN =
  /\b(do\s+you\s+know|can\s+you\s+speak|do\s+you\s+speak|know\s+malayalam|know\s+tamil|know\s+hindi|speak\s+malayalam|speak\s+tamil|speak\s+hindi|മലയാളം\s*അറിയാമോ|അറിയാമോ|നിങ്ങൾക്ക്\s*മലയാളം|നിനക്ക്\s*മലയാളം)\b/i

const OFF_TOPIC_PATTERN =
  /\b(read\s+(this\s+)?pdf|read\s+this\s+file|open\s+this\s+link|who\s+(built|made|created)\s+(this|the)\s+(app|website|bot)|what\s+is\s+ai|tell\s+me\s+a\s+joke|news\s+today)\b/i

const ORDER_NUMBER_PATTERN = /\b([A-Z]{3}\d{2}-\d+)\b/i

const ORDER_STATUS_PATTERN =
  /\b(my\s+orders?|last\s+order|recent\s+order|all\s+(my\s+)?orders?|total\s+orders?|how\s+many\s+orders?|order\s+status|order\s+update|where\s+is\s+(my\s+)?order|track(ing)?(\s+my\s+order|\s+number|\s+id)?|shipped|delivery\s+status|payment\s+status|order\s+number|order\s+no\.?|order\s+#|ordered|order\s+evide|kittiyilla|kitteela|ella\s+orders?|orders?\s+okke)\b|എവിടെ|ഓർഡർ|ഓര്‍ഡര്‍/i

/**
 * Customer wants a list / count of all orders under their number — not only the last one.
 */
const ALL_ORDERS_SCOPE_PATTERN =
  /\b(all\s+(my\s+)?orders?|my\s+orders\b|total\s+orders?|how\s+many\s+orders?|orders?\s+list|list\s+(my\s+)?orders?|ella\s+orders?|orders?\s+okke|orders?\s+ellam|ente\s+orders(?:\s+ellam)?\b|njangalude\s+orders?|എല്ലാ\s*ഓർഡർ|ഓർഡറുകൾ)\b/i

/** Words that mean "track an existing order" rather than "I want to order". */
const ORDER_TRACKING_WORD_PATTERN =
  /\b(status|track(ing)?|shipped|shipping|delivered|dispatch(ed)?|where|evide|kittiyilla|kitteela|update)\b|എവിടെ|കിട്ടി|ട്രാക്ക്/i

const ORDER_PRODUCT_PATTERN =
  /\b(?:my|the|where\s+is)\s+(?:\w+\s+){0,3}order\b|\border\s+(?:for|with|of)\s+/i

const MALAYALAM_SCRIPT = /[\u0D00-\u0D7F]/
const TAMIL_SCRIPT = /[\u0B80-\u0BFF]/

const SIZE_PATTERN = /\b(x{0,2}[sml]|xxl|xxxl|small|medium|large|extra\s*large)\b/i
const SIZE_MAP: Record<string, string> = {
  small: 'S',
  s: 'S',
  medium: 'M',
  m: 'M',
  large: 'L',
  l: 'L',
  xl: 'XL',
  xxl: 'XXL',
  xxxl: 'XXXL',
  'extra large': 'XL',
}

const COLOR_WORDS = [
  'black', 'white', 'blue', 'red', 'green', 'yellow', 'pink', 'purple',
  'orange', 'brown', 'grey', 'gray', 'navy', 'beige', 'maroon', 'cream', 'gold', 'silver',
]

const MALAYALAM_COLOR_MAP: Record<string, string> = {
  വെള്ള: 'White',
  വെള്ളം: 'White',
  velutha: 'White',
  vella: 'White',
  നീല: 'Blue',
  neela: 'Blue',
  കറുപ്പ്: 'Black',
  karuppu: 'Black',
  പച്ച: 'Green',
  pacha: 'Green',
  ചുവപ്പ്: 'Red',
  chuvappu: 'Red',
}

const CATEGORY_WORDS = [
  't-shirt', 'tshirt', 'shirts', 'shirt',
  'trousers', 'trouser', 'pants', 'pant', 'jeans',
  'dresses', 'dress', 'kurta', 'saree', 'sari', 'tops', 'top',
  'jackets', 'jacket', 'shoes', 'shoe', 'beanie', 'benny', 'innerwear',
]

const CATEGORY_GROUPS: Record<string, string[]> = {
  shirts: ['t-shirt', 'tshirt', 'shirts', 'shirt'],
  pants: ['trousers', 'trouser', 'pants', 'pant', 'jeans'],
  dresses: ['dresses', 'dress'],
  kurtas: ['kurta'],
  sarees: ['saree', 'sari'],
  tops: ['tops', 'top'],
  jackets: ['jackets', 'jacket'],
  shoes: ['shoes', 'shoe'],
  beanies: ['beanie', 'benny'],
  innerwear: ['innerwear'],
}

const BUY_SIGNAL_PATTERN =
  /\b(need|want|send|show|photo|image|picture|pic|pair|looking\s+for|undo|undu|vendath|vendam|koodi|ayackavo|ayakkavo|ayakku)\b|pantsinte|pair\s*cheyy|ഉണ്ടോ/i

const OWNERSHIP_PATTERN =
  /\b(have|already\s+own|own|kayyil|ente\s+kayyil|kayyil\s+oru|ond|undu)\b/i

type CategoryHit = {
  word: string
  canonical: string
  index: number
  end: number
}

export function detectLanguageAndScript(text: string): {
  language: string
  scriptStyle: ScriptStyle
} {
  if (MALAYALAM_SCRIPT.test(text)) {
    return { language: 'Malayalam', scriptStyle: 'malayalam_script' }
  }
  if (TAMIL_SCRIPT.test(text)) return { language: 'Tamil', scriptStyle: 'other' }
  if (/[\u0900-\u097F]/.test(text)) return { language: 'Hindi', scriptStyle: 'other' }
  if (/[\u0600-\u06FF]/.test(text)) return { language: 'Arabic', scriptStyle: 'other' }
  if (MANGLISH_PATTERN.test(text)) return { language: 'Malayalam', scriptStyle: 'latin' }
  return { language: 'English', scriptStyle: 'latin' }
}

function detectLanguageFromText(text: string): string {
  return detectLanguageAndScript(text).language
}

/**
 * Script to answer in. A Malayalam customer typing Latin letters gets Manglish
 * back; Malayalam script only when they used Malayalam script themselves.
 */
function resolveScriptStyle(text: string, language: string): ScriptStyle {
  const detected = detectLanguageAndScript(text)
  if (detected.scriptStyle === 'malayalam_script') return 'malayalam_script'
  if (language.trim().toLowerCase() === 'malayalam') return 'latin'
  return detected.scriptStyle
}

function isGreeting(text: string): boolean {
  return GREETING_PATTERN.test(text.trim())
}

function isAcknowledgement(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (EMOJI_ONLY_PATTERN.test(trimmed)) return true
  return ACK_PATTERN.test(trimmed)
}

function isBuyIntent(text: string): boolean {
  return BUY_INTENT_PATTERN.test(text.trim())
}

function isLanguageMetaQuestion(text: string): boolean {
  return LANGUAGE_META_PATTERN.test(text.trim())
}

function isOffTopicMessage(text: string): boolean {
  return OFF_TOPIC_PATTERN.test(text.trim())
}

function extractSku(text: string): string | null {
  const match = text.match(/\b(?:sku|item\s*#?)\s*[:#-]?\s*([a-z0-9-]+)/i)
  return match?.[1]?.trim() ?? null
}

function extractSize(text: string): string | null {
  const match = text.match(SIZE_PATTERN)
  if (!match) return null
  const raw = match[1].toLowerCase()
  return SIZE_MAP[raw] ?? raw.toUpperCase()
}

function extractColor(text: string): string | null {
  const lower = text.toLowerCase()
  for (const color of COLOR_WORDS) {
    if (new RegExp(`\\b${color}\\b`, 'i').test(lower)) {
      return color.charAt(0).toUpperCase() + color.slice(1)
    }
  }
  for (const [word, color] of Object.entries(MALAYALAM_COLOR_MAP)) {
    if (text.includes(word) || lower.includes(word.toLowerCase())) {
      return color
    }
  }
  return null
}

function canonicalCategory(term: string): string | null {
  const lower = term.toLowerCase().trim()
  if (!lower) return null
  for (const [canonical, words] of Object.entries(CATEGORY_GROUPS)) {
    if (words.some((w) => lower === w || lower.includes(w))) {
      return canonical
    }
  }
  return null
}

function categoryWordPattern(cat: string): RegExp {
  const base = cat.replace('-', '[- ]?')
  return new RegExp(`\\b${base}(?:inte|nte|um)?\\b`, 'gi')
}

function findCategoryHits(text: string): CategoryHit[] {
  const lower = text.toLowerCase()
  const hits: CategoryHit[] = []
  for (const cat of CATEGORY_WORDS) {
    const re = categoryWordPattern(cat)
    let match: RegExpExecArray | null
    while ((match = re.exec(lower)) !== null) {
      const canonical = canonicalCategory(cat)
      if (!canonical) continue
      hits.push({
        word: cat,
        canonical,
        index: match.index,
        end: match.index + match[0].length,
      })
    }
  }
  hits.sort((a, b) => a.index - b.index || b.word.length - a.word.length)
  const deduped: CategoryHit[] = []
  for (const hit of hits) {
    const overlaps = deduped.some((d) => hit.index < d.end && hit.end > d.index)
    if (!overlaps) deduped.push(hit)
  }
  return deduped
}

function windowScore(text: string, index: number, end: number): number {
  const start = Math.max(0, index - 36)
  const stop = Math.min(text.length, end + 48)
  const window = text.slice(start, stop)
  let score = 0
  if (BUY_SIGNAL_PATTERN.test(window)) score += 4
  if (OWNERSHIP_PATTERN.test(window)) score -= 5
  return score
}

export function extractRequestedCategory(text: string): string | null {
  const hits = findCategoryHits(text)
  if (hits.length === 0) return null
  if (hits.length === 1) return hits[0].canonical

  let best = hits[0]
  let bestScore = windowScore(text, best.index, best.end)
  for (const hit of hits.slice(1)) {
    const score = windowScore(text, hit.index, hit.end)
    if (score > bestScore || (score === bestScore && hit.index > best.index)) {
      best = hit
      bestScore = score
    }
  }
  return best.canonical
}

function extractCategory(text: string): string | null {
  return extractRequestedCategory(text) ?? findCategoryHits(text)[0]?.canonical ?? null
}

export function extractRequestedColor(text: string, requestedCategory: string | null): string | null {
  const color = extractColor(text)
  if (!color || !requestedCategory) return color

  const hits = findCategoryHits(text)
  const otherHits = hits.filter((h) => h.canonical !== requestedCategory)
  if (otherHits.length === 0) return color

  const lower = text.toLowerCase()
  const colorIdx = lower.search(new RegExp(`\\b${color.toLowerCase()}\\b`, 'i'))
  const malayalamIdx = Object.entries(MALAYALAM_COLOR_MAP).reduce((found, [word]) => {
    if (found >= 0) return found
    return text.indexOf(word) >= 0 ? text.indexOf(word) : lower.indexOf(word.toLowerCase())
  }, -1)
  const idx = colorIdx >= 0 ? colorIdx : malayalamIdx
  if (idx < 0) return color

  const requestedHits = hits.filter((h) => h.canonical === requestedCategory)
  const distToRequested = requestedHits.length
    ? Math.min(...requestedHits.map((h) => Math.abs(h.index - idx)))
    : Number.POSITIVE_INFINITY
  const distToOther = Math.min(...otherHits.map((h) => Math.abs(h.index - idx)))

  if (distToOther < distToRequested) return null
  return color
}

export function categoriesConflict(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = a ? canonicalCategory(a) : null
  const right = b ? canonicalCategory(b) : null
  return Boolean(left && right && left !== right)
}

function stripExtractedTerms(text: string, color: string | null, size: string | null): string {
  let q = text
  if (color) q = q.replace(new RegExp(`\\b${color}\\b`, 'gi'), ' ')
  if (size) q = q.replace(SIZE_PATTERN, ' ')
  q = q.replace(
    /\b(photo|image|picture|pic|send|show|want|need|looking\s+for|do\s+you\s+have|price|how\s+much|wedding|party|tomorrow|birthday|gift|undo|undu|ഉണ്ടോ|ഇല്ല)\b/gi,
    ' '
  )
  return q.replace(/\s+/g, ' ').trim()
}

function wantsImageFromText(text: string): boolean {
  return /\b(photo|images?|picture|pic|send\s+me|show\s+me|ayackavo|ayakkavo|ayakku)\b/i.test(text)
}

export function extractOrderNumber(text: string): string | null {
  const explicit = text.match(
    /\b(?:order\s*(?:#|no\.?|number)?\s*[:#-]?\s*)([A-Z]{3}\d{2}-\d+)\b/i
  )
  if (explicit?.[1]) return explicit[1].toUpperCase()
  const bare = text.match(ORDER_NUMBER_PATTERN)
  return bare?.[1]?.toUpperCase() ?? null
}

export function extractOrderNumberHint(text: string): string | null {
  if (extractOrderNumber(text)) return null
  const match = text.match(/\border\s*(?:#|no\.?|number)?\s*[:#-]?\s*(\d{1,6})\b/i)
  return match?.[1] ?? null
}

export function extractPhoneFromText(text: string): string | null {
  const withoutOrders = text.replace(ORDER_NUMBER_PATTERN, ' ')
  const match = withoutOrders.match(/(?:^|[^\d])(\d{10,15})(?:[^\d]|$)/)
  return match?.[1] ?? null
}

export function isOrderStatusMessage(text: string): boolean {
  const trimmed = text.trim()
  return (
    ORDER_STATUS_PATTERN.test(trimmed) ||
    ALL_ORDERS_SCOPE_PATTERN.test(trimmed) ||
    extractOrderNumber(text) !== null ||
    extractOrderNumberHint(text) !== null
  )
}

export function isAllOrdersScopeMessage(text: string): boolean {
  return ALL_ORDERS_SCOPE_PATTERN.test(text.trim())
}

export function extractOrderProductHint(text: string): string | null {
  const stripped = text
    .replace(ORDER_NUMBER_PATTERN, ' ')
    .replace(
      /\b(my|last|recent|the|where|is|order|status|tracking|track|shipped|delivery|payment|update|number|no|for|with|of|a|an)\b/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim()

  const category = extractCategory(stripped)
  if (category) return category.replace(/s$/, '') || category

  const words = stripped
    .split(/\s+/)
    .filter((w) => w.length > 2 && !/^\d+$/.test(w))
  return words.length > 0 ? words.join(' ') : null
}

export function resolveOrderScope(
  text: string,
  orderNumber: string | null,
  orderProductHint: string | null
): OrderScope {
  if (orderNumber || extractOrderNumberHint(text)) return 'specific'
  if (isAllOrdersScopeMessage(text)) return 'all'
  if (orderProductHint && ORDER_PRODUCT_PATTERN.test(text)) return 'product'
  if (/\b(last|recent)\s+order\b/i.test(text) && !orderProductHint) return 'latest'
  if (/\bmy\s+order\b/i.test(text) && !orderProductHint) return 'latest'
  if (isOrderStatusMessage(text)) return 'latest'
  return null
}

function buildRequestedItem(
  searchQuery: string,
  color: string | null,
  size: string | null,
  categoryName: string | null
): string | null {
  const parts: string[] = []
  if (color) parts.push(color.toLowerCase())
  if (searchQuery.trim()) parts.push(searchQuery.trim())
  else if (categoryName) parts.push(categoryName)
  if (size) parts.push(`size ${size}`)
  return parts.join(' ').trim() || null
}

function normalizeIntent(
  intent: CustomerIntent,
  hasProductSignals: boolean,
  hasCatalogSignals: boolean
): CustomerIntent {
  if (intent === 'order_status') return 'order_status'
  if (intent === 'off_topic' && hasProductSignals) return 'product_search'
  // "ok" is a reaction, but "ok blue shirt undo?" names a new product.
  if ((intent === 'acknowledgement' || intent === 'buy_intent') && hasCatalogSignals) {
    return 'product_search'
  }
  return intent
}

function finalizeIntent(
  partial: Omit<
    ParsedCustomerIntent,
    'requestedItem' | 'orderNumberHint' | 'typedPhone' | 'scriptStyle'
  > & {
    requestedItem?: string | null
    orderNumberHint?: string | null
    typedPhone?: string | null
    scriptStyle?: ScriptStyle
  },
  trimmed: string
): ParsedCustomerIntent {
  const hasCatalogSignals = Boolean(
    partial.searchQuery.trim() ||
      partial.color ||
      partial.sku ||
      partial.categoryName
  )

  const hasProductSignals = Boolean(
    hasCatalogSignals ||
      partial.size ||
      partial.intent === 'product_search' ||
      partial.intent === 'image_request' ||
      partial.intent === 'sku_lookup' ||
      partial.intent === 'category_search'
  )

  const intent = normalizeIntent(partial.intent, hasProductSignals, hasCatalogSignals)

  // Reactions and order questions carry no product, so they must never leak a
  // stale searchQuery into the catalog lookup (that is what turned "ok" into a
  // "we don't have ok" reply).
  const isNonCatalog = NON_CATALOG_INTENTS.has(intent)

  const requestedItem = isNonCatalog
    ? null
    : partial.requestedItem?.trim() ||
      buildRequestedItem(partial.searchQuery, partial.color, partial.size, partial.categoryName) ||
      (partial.searchQuery.trim() || null)

  const detected = detectLanguageAndScript(trimmed)
  const customerLanguage =
    partial.customerLanguage?.trim() && partial.customerLanguage !== 'Unknown'
      ? partial.customerLanguage.trim()
      : detected.language

  return {
    ...partial,
    intent,
    customerLanguage,
    scriptStyle: partial.scriptStyle ?? resolveScriptStyle(trimmed, customerLanguage),
    requestedItem,
    searchQuery: isNonCatalog ? '' : partial.searchQuery.trim(),
    color: isNonCatalog ? null : partial.color?.trim() || null,
    size: partial.size?.trim()?.toUpperCase() || null,
    sku: isNonCatalog ? null : partial.sku?.trim() || null,
    categoryName: isNonCatalog ? null : partial.categoryName?.trim() || null,
    orderNumber: partial.orderNumber?.trim()?.toUpperCase() || null,
    orderNumberHint: partial.orderNumberHint?.trim() || null,
    orderProductHint: partial.orderProductHint?.trim() || null,
    orderScope: partial.orderScope ?? null,
    typedPhone: partial.typedPhone?.trim() || null,
  }
}

export function fromLlmResult(parsed: LlmIntentResult, trimmed: string): ParsedCustomerIntent {
  const requestedCategory = extractRequestedCategory(trimmed)
  const colorFromText = extractRequestedColor(trimmed, requestedCategory)
  const sizeFromText = extractSize(trimmed)
  const categoryFromText = requestedCategory || extractCategory(trimmed)
  const skuFromText = extractSku(trimmed)
  const orderNumberFromText = extractOrderNumber(trimmed)
  const orderNumberHintFromText = extractOrderNumberHint(trimmed)
  const typedPhoneFromText = extractPhoneFromText(trimmed)
  const orderProductHintFromText = extractOrderProductHint(trimmed)

  const llmCategory = parsed.categoryName?.trim() || null
  const categoryName = requestedCategory || llmCategory || categoryFromText

  const size = parsed.size?.trim()?.toUpperCase() || sizeFromText
  const orderNumber = parsed.orderNumber?.trim()?.toUpperCase() || orderNumberFromText
  const orderNumberHint = parsed.orderNumberHint?.trim() || orderNumberHintFromText
  const typedPhone = parsed.typedPhone?.trim() || typedPhoneFromText
  const orderProductHint = parsed.orderProductHint?.trim() || orderProductHintFromText

  // The message itself is the authority on whether a product was named. When the
  // customer only reacted ("ok"), the LLM sometimes carries the previous product
  // over from history — that produced replies about products they never re-asked for.
  const mentionsProduct = Boolean(requestedCategory || colorFromText || skuFromText)
  const looksLikeOrderQuestion = isOrderStatusMessage(trimmed)
  const reactionOnly = !mentionsProduct && !looksLikeOrderQuestion
  const intent: CustomerIntent =
    reactionOnly && isAcknowledgement(trimmed)
      ? 'acknowledgement'
      : reactionOnly && isBuyIntent(trimmed)
        ? 'buy_intent'
        : parsed.intent ?? 'product_search'

  const llmConflicts =
    Boolean(requestedCategory) &&
    (categoriesConflict(parsed.searchQuery, requestedCategory) ||
      categoriesConflict(llmCategory, requestedCategory))

  const color = llmConflicts
    ? colorFromText
    : parsed.color?.trim() || colorFromText

  const searchQuery = NON_CATALOG_INTENTS.has(intent)
    ? ''
    : llmConflicts && requestedCategory
      ? requestedCategory
      : parsed.searchQuery?.trim() ||
        stripExtractedTerms(trimmed, color, size) ||
        categoryName ||
        ''

  const orderScope =
    parsed.orderScope ??
    (intent === 'order_status'
      ? resolveOrderScope(trimmed, orderNumber, orderProductHint)
      : null)

  return finalizeIntent(
    {
      intent,
      customerLanguage: parsed.customerLanguage ?? detectLanguageFromText(trimmed),
      requestedItem: llmConflicts
        ? buildRequestedItem(searchQuery, color, size, categoryName)
        : parsed.requestedItem ?? null,
      searchQuery,
      color,
      size,
      sku: parsed.sku?.trim() || skuFromText,
      categoryName,
      wantsImage: parsed.wantsImage === true || wantsImageFromText(trimmed),
      orderNumber,
      orderNumberHint,
      orderProductHint,
      orderScope,
      typedPhone,
    },
    trimmed
  )
}

/**
 * Regex-only classification. Used when the LLM is unavailable, when the message
 * needs no classification (bare reactions), and by fixtures.
 */
export function parseCustomerIntentOffline(text: string): ParsedCustomerIntent {
  return regexFallback(text.trim())
}

function regexFallback(trimmed: string): ParsedCustomerIntent {
  const skuFromText = extractSku(trimmed)
  const categoryFromText = extractCategory(trimmed)
  const colorFromText = extractRequestedColor(trimmed, categoryFromText)
  const sizeFromText = extractSize(trimmed)
  const detectedLang = detectLanguageFromText(trimmed)

  if (isLanguageMetaQuestion(trimmed)) {
    return finalizeIntent(
      {
        intent: 'off_topic',
        customerLanguage: detectedLang,
        searchQuery: '',
        color: null,
        size: null,
        sku: null,
        categoryName: null,
        wantsImage: false,
        orderNumber: null,
        orderNumberHint: null,
        orderProductHint: null,
        orderScope: null,
        typedPhone: null,
        offTopicReason: 'language_meta',
      },
      trimmed
    )
  }

  if (isOffTopicMessage(trimmed) && !colorFromText && !categoryFromText) {
    return finalizeIntent(
      {
        intent: 'off_topic',
        customerLanguage: detectedLang,
        searchQuery: '',
        color: null,
        size: null,
        sku: null,
        categoryName: null,
        wantsImage: false,
        orderNumber: null,
        orderNumberHint: null,
        orderProductHint: null,
        orderScope: null,
        typedPhone: null,
        offTopicReason: 'general',
      },
      trimmed
    )
  }

  if (isGreeting(trimmed)) {
    return finalizeIntent(
      {
        intent: 'greeting',
        customerLanguage: detectedLang,
        searchQuery: '',
        color: null,
        size: null,
        sku: skuFromText,
        categoryName: null,
        wantsImage: false,
        orderNumber: null,
        orderNumberHint: null,
        orderProductHint: null,
        orderScope: null,
        typedPhone: null,
      },
      trimmed
    )
  }

  const orderNumberFromText = extractOrderNumber(trimmed)

  // "ഓർഡർ ചെയ്യാം" / "how to order" is a customer wanting to buy, not asking
  // where an existing order is. ORDER_STATUS_PATTERN matches the bare word
  // "ഓർഡർ", so buy intent has to be checked first.
  if (
    isBuyIntent(trimmed) &&
    !orderNumberFromText &&
    !extractOrderNumberHint(trimmed) &&
    !ORDER_TRACKING_WORD_PATTERN.test(trimmed)
  ) {
    return finalizeIntent(
      {
        intent: 'buy_intent',
        customerLanguage: detectedLang,
        searchQuery: '',
        color: null,
        size: sizeFromText,
        sku: null,
        categoryName: null,
        wantsImage: false,
        orderNumber: null,
        orderNumberHint: null,
        orderProductHint: null,
        orderScope: null,
        typedPhone: null,
      },
      trimmed
    )
  }

  if (isOrderStatusMessage(trimmed)) {
    const orderProductHint = extractOrderProductHint(trimmed)
    const orderScope = resolveOrderScope(trimmed, orderNumberFromText, orderProductHint)
    return finalizeIntent(
      {
        intent: 'order_status',
        customerLanguage: detectedLang,
        searchQuery: '',
        color: null,
        size: null,
        sku: null,
        categoryName: null,
        wantsImage: false,
        orderNumber: orderNumberFromText,
        orderNumberHint: extractOrderNumberHint(trimmed),
        orderProductHint,
        orderScope,
        typedPhone: extractPhoneFromText(trimmed),
      },
      trimmed
    )
  }

  if (skuFromText) {
    return finalizeIntent(
      {
        intent: 'sku_lookup',
        customerLanguage: detectedLang,
        searchQuery: '',
        color: colorFromText,
        size: sizeFromText,
        sku: skuFromText,
        categoryName: categoryFromText,
        wantsImage: wantsImageFromText(trimmed),
        orderNumber: null,
        orderNumberHint: null,
        orderProductHint: null,
        orderScope: null,
        typedPhone: null,
      },
      trimmed
    )
  }

  // Reactions ("ok", "thanks") and buy asks ("order cheyyam") name no product.
  // Without this they fell through to product_search below with searchQuery "ok",
  // matched nothing, and produced a "we don't have ok" reply.
  if (!categoryFromText && !colorFromText && !skuFromText) {
    if (isAcknowledgement(trimmed) || isBuyIntent(trimmed)) {
      return finalizeIntent(
        {
          intent: isAcknowledgement(trimmed) ? 'acknowledgement' : 'buy_intent',
          customerLanguage: detectedLang,
          searchQuery: '',
          color: null,
          size: sizeFromText,
          sku: null,
          categoryName: null,
          wantsImage: false,
          orderNumber: null,
          orderNumberHint: null,
          orderProductHint: null,
          orderScope: null,
          typedPhone: null,
        },
        trimmed
      )
    }
  }

  const searchQuery =
    stripExtractedTerms(trimmed, colorFromText, sizeFromText) || categoryFromText || trimmed

  return finalizeIntent(
    {
      intent: 'product_search',
      customerLanguage: detectedLang,
      searchQuery,
      color: colorFromText,
      size: sizeFromText,
      sku: null,
      categoryName: categoryFromText,
      wantsImage: wantsImageFromText(trimmed),
      orderNumber: null,
      orderNumberHint: null,
      orderProductHint: null,
      orderScope: null,
      typedPhone: null,
    },
    trimmed
  )
}

function buildIntentPrompt(text: string, recentMessages?: ConversationHistoryLine[]): string {
  if (!recentMessages?.length) return text
  const customerOnly = recentMessages.filter((m) => m.role === 'customer')
  const history = (customerOnly.length > 0 ? customerOnly : recentMessages)
    .map((m) => `${m.role === 'customer' ? 'Customer' : 'Store'}: ${m.text}`)
    .join('\n')
  return `Recent conversation (customer messages only — for follow-ups like color-only replies). Latest message product type overrides earlier products:\n${history}\n\nLatest customer message:\n${text}`
}

export async function parseCustomerIntent(
  text: string,
  options?: ParseCustomerIntentOptions
): Promise<ParsedCustomerIntent> {
  const trimmed = text.trim()
  if (!trimmed) {
    return finalizeIntent(
      {
        intent: 'off_topic',
        customerLanguage: 'English',
        searchQuery: '',
        color: null,
        size: null,
        sku: null,
        categoryName: null,
        wantsImage: false,
        orderNumber: null,
        orderNumberHint: null,
        orderProductHint: null,
        orderScope: null,
        typedPhone: null,
        offTopicReason: 'general',
      },
      trimmed
    )
  }

  if (isLanguageMetaQuestion(trimmed)) {
    return regexFallback(trimmed)
  }

  // A bare reaction needs no classification, and skipping the LLM stops it from
  // carrying the previous product over from history.
  if (
    isAcknowledgement(trimmed) &&
    !extractRequestedCategory(trimmed) &&
    !extractColor(trimmed) &&
    !extractSku(trimmed) &&
    !isOrderStatusMessage(trimmed)
  ) {
    return regexFallback(trimmed)
  }

  const llmInput = buildIntentPrompt(trimmed, options?.recentMessages)
  const parsed = await completeJson<LlmIntentResult>(INTENT_SCHEMA, llmInput)
  if (parsed?.intent && parsed.customerLanguage) {
    const result = fromLlmResult(parsed, trimmed)
    if (parsed.intent === 'off_topic' && isLanguageMetaQuestion(trimmed)) {
      return { ...result, offTopicReason: 'language_meta' }
    }
    if (parsed.intent === 'off_topic') {
      return { ...result, offTopicReason: 'general' }
    }
    return result
  }

  if (parsed?.intent) {
    return fromLlmResult(
      { ...parsed, customerLanguage: parsed.customerLanguage ?? detectLanguageFromText(trimmed) },
      trimmed
    )
  }

  return regexFallback(trimmed)
}
