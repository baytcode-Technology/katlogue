import { completeJson } from '../../../shared/llm/index.js'

export type CustomerIntent =
  | 'greeting'
  | 'product_search'
  | 'sku_lookup'
  | 'category_search'
  | 'image_request'
  | 'order_status'
  | 'off_topic'
  | 'explicit'

export type OrderScope = 'latest' | 'specific' | 'product' | null

export type ParsedCustomerIntent = {
  intent: CustomerIntent
  customerLanguage: string
  requestedItem: string | null
  searchQuery: string
  color: string | null
  size: string | null
  sku: string | null
  categoryName: string | null
  wantsImage: boolean
  orderNumber: string | null
  orderProductHint: string | null
  orderScope: OrderScope
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

type LlmIntentResult = {
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
  orderProductHint?: string | null
  orderScope?: OrderScope
}

const INTENT_SCHEMA = `You classify customer messages for a store WhatsApp/Instagram inbox.

CRITICAL — Language:
- Detect the EXACT language the customer wrote in.
- Malayalam script or words → customerLanguage: "Malayalam" (NOT Tamil)
- Tamil script or words → customerLanguage: "Tamil"
- Mixed English + Malayalam → customerLanguage: "Malayalam" (or note mixed — still reply in their mix)
- NEVER assign Tamil if they wrote Malayalam. NEVER assign a different language than what the customer used.

CRITICAL — Extract product only:
- IGNORE personal stories, events, reasons (wedding, party, tomorrow, gift, birthday, etc.)
- "വെള്ള shirt ഉണ്ടോ?" → product_search, searchQuery: "shirt", color: "white", customerLanguage: "Malayalam"
- "blue shirt undo?" → product_search, searchQuery: "shirt", color: "blue", requestedItem: "blue shirt"
- Follow-ups: if they previously asked about shirts and now say "white?" or "വെള്ള?" → product_search, color: "white", searchQuery: "shirt"
- Only extract what product they want to buy.

Normalize product search terms to English for database lookup.

Return JSON only:
{
  "intent": "greeting" | "product_search" | "sku_lookup" | "category_search" | "image_request" | "order_status" | "off_topic" | "explicit",
  "customerLanguage": "exact language name e.g. English, Hindi, Malayalam, Tamil, Punjabi, Arabic",
  "requestedItem": "product they want in English e.g. white shirt, or null",
  "searchQuery": "English product terms without color/size e.g. shirt",
  "color": "English color e.g. white, black, or null",
  "size": "S, M, L, XL, or null",
  "sku": "SKU if mentioned or null",
  "categoryName": "English category e.g. shirts, pants, or null",
  "wantsImage": true if they ask for photo/image,
  "orderNumber": "order number e.g. JAN26-3 if mentioned, or null",
  "orderProductHint": "product name in an order question e.g. shirt, or null",
  "orderScope": "latest" | "specific" | "product" | null
}

Rules:
- Any product availability, price, or shopping question = product_search (NOT off_topic), even with personal context.
- order_status for: my/last/recent order, order status, tracking, shipped, delivery, payment status, where is my order — NOT product_search or off_topic.
- "where is my shirt order" → order_status, orderScope: "product", orderProductHint: "shirt", searchQuery: "".
- "status of order JAN26-5" → order_status, orderScope: "specific", orderNumber: "JAN26-5".
- "my last order" → order_status, orderScope: "latest".
- Messages in any language about products = product_search (unless clearly about an existing order).
- off_topic for: "do you know Malayalam?", "can you speak Hindi?", reading PDFs/files, general knowledge, app/code questions, unrelated chat — NO shopping intent.
- explicit only for sexual/violent/harassing content.`

const GREETING_PATTERN =
  /^(hi|hello|hey|hii|helo|good\s+(morning|afternoon|evening)|namaste|vanakkam|hola|assalam|salam|നമസ്കാരം|ഹലോ|നമസ്കാര|नमस्ते|হ্যালো)\b/i

const LANGUAGE_META_PATTERN =
  /\b(do\s+you\s+know|can\s+you\s+speak|do\s+you\s+speak|know\s+malayalam|know\s+tamil|know\s+hindi|speak\s+malayalam|speak\s+tamil|speak\s+hindi|മലയാളം\s*അറിയാമോ|അറിയാമോ|നിങ്ങൾക്ക്\s*മലയാളം|നിനക്ക്\s*മലയാളം)\b/i

const OFF_TOPIC_PATTERN =
  /\b(read\s+(this\s+)?pdf|read\s+this\s+file|open\s+this\s+link|who\s+(built|made|created)\s+(this|the)\s+(app|website|bot)|what\s+is\s+ai|tell\s+me\s+a\s+joke|news\s+today)\b/i

const ORDER_NUMBER_PATTERN = /\b([A-Z]{3}\d{2}-\d+)\b/i

const ORDER_STATUS_PATTERN =
  /\b(my\s+order|last\s+order|recent\s+order|order\s+status|order\s+update|where\s+is\s+(my\s+)?order|track(ing)?(\s+my\s+order|\s+number|\s+id)?|shipped|delivery\s+status|payment\s+status|order\s+number|order\s+no\.?|order\s+#)\b/i

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
  'shirt', 'shirts', 'pant', 'pants', 'trouser', 'trousers', 'jeans',
  'dress', 'dresses', 'kurta', 'saree', 'sari', 'top', 'tops',
  'jacket', 'jackets', 'shoe', 'shoes', 'benny', 'beanie', 't-shirt', 'tshirt', 'innerwear',
]

function detectLanguageFromText(text: string): string {
  if (MALAYALAM_SCRIPT.test(text)) return 'Malayalam'
  if (TAMIL_SCRIPT.test(text)) return 'Tamil'
  if (/[\u0900-\u097F]/.test(text)) return 'Hindi'
  if (/[\u0600-\u06FF]/.test(text)) return 'Arabic'
  return 'English'
}

function isGreeting(text: string): boolean {
  return GREETING_PATTERN.test(text.trim())
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

function extractCategory(text: string): string | null {
  const lower = text.toLowerCase()
  for (const cat of CATEGORY_WORDS) {
    if (new RegExp(`\\b${cat.replace('-', '[- ]?')}\\b`, 'i').test(lower)) {
      if (cat === 't-shirt' || cat === 'tshirt') return 'shirts'
      if (cat === 'benny' || cat === 'beanie') return cat
      return cat.endsWith('s') ? cat : `${cat}s`
    }
  }
  return null
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
  return /\b(photo|image|picture|pic|send\s+me|show\s+me)\b/i.test(text)
}

export function extractOrderNumber(text: string): string | null {
  const explicit = text.match(
    /\b(?:order\s*(?:#|no\.?|number)?\s*[:#-]?\s*)([A-Z]{3}\d{2}-\d+)\b/i
  )
  if (explicit?.[1]) return explicit[1].toUpperCase()
  const bare = text.match(ORDER_NUMBER_PATTERN)
  return bare?.[1]?.toUpperCase() ?? null
}

export function isOrderStatusMessage(text: string): boolean {
  return ORDER_STATUS_PATTERN.test(text.trim()) || extractOrderNumber(text) !== null
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
  if (orderNumber) return 'specific'
  if (/\b(last|recent|my)\s+order\b/i.test(text) && !orderProductHint) return 'latest'
  if (orderProductHint && ORDER_PRODUCT_PATTERN.test(text)) return 'product'
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

function normalizeIntent(intent: CustomerIntent, hasProductSignals: boolean): CustomerIntent {
  if (intent === 'order_status') return 'order_status'
  if (intent === 'off_topic' && hasProductSignals) return 'product_search'
  return intent
}

function finalizeIntent(
  partial: Omit<ParsedCustomerIntent, 'requestedItem'> & { requestedItem?: string | null },
  trimmed: string
): ParsedCustomerIntent {
  const requestedItem =
    partial.requestedItem?.trim() ||
    buildRequestedItem(partial.searchQuery, partial.color, partial.size, partial.categoryName) ||
    (partial.searchQuery.trim() || null)

  const hasProductSignals = Boolean(
    partial.searchQuery.trim() ||
      partial.color ||
      partial.size ||
      partial.sku ||
      partial.categoryName ||
      partial.intent === 'product_search' ||
      partial.intent === 'image_request' ||
      partial.intent === 'sku_lookup' ||
      partial.intent === 'category_search'
  )

  const detectedLang = detectLanguageFromText(trimmed)

  return {
    ...partial,
    intent: normalizeIntent(partial.intent, hasProductSignals),
    customerLanguage:
      partial.customerLanguage?.trim() && partial.customerLanguage !== 'Unknown'
        ? partial.customerLanguage.trim()
        : detectedLang,
    requestedItem,
    searchQuery: partial.intent === 'order_status' ? '' : partial.searchQuery.trim(),
    color: partial.color?.trim() || null,
    size: partial.size?.trim()?.toUpperCase() || null,
    sku: partial.sku?.trim() || null,
    categoryName: partial.categoryName?.trim() || null,
    orderNumber: partial.orderNumber?.trim()?.toUpperCase() || null,
    orderProductHint: partial.orderProductHint?.trim() || null,
    orderScope: partial.orderScope ?? null,
  }
}

function fromLlmResult(parsed: LlmIntentResult, trimmed: string): ParsedCustomerIntent {
  const colorFromText = extractColor(trimmed)
  const sizeFromText = extractSize(trimmed)
  const categoryFromText = extractCategory(trimmed)
  const skuFromText = extractSku(trimmed)
  const orderNumberFromText = extractOrderNumber(trimmed)
  const orderProductHintFromText = extractOrderProductHint(trimmed)

  const color = parsed.color?.trim() || colorFromText
  const size = parsed.size?.trim()?.toUpperCase() || sizeFromText
  const categoryName = parsed.categoryName?.trim() || categoryFromText
  const orderNumber = parsed.orderNumber?.trim()?.toUpperCase() || orderNumberFromText
  const orderProductHint = parsed.orderProductHint?.trim() || orderProductHintFromText
  const intent = parsed.intent ?? 'product_search'
  const searchQuery =
    intent === 'order_status'
      ? ''
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
      requestedItem: parsed.requestedItem ?? null,
      searchQuery,
      color,
      size,
      sku: parsed.sku?.trim() || skuFromText,
      categoryName,
      wantsImage: parsed.wantsImage === true || wantsImageFromText(trimmed),
      orderNumber,
      orderProductHint,
      orderScope,
    },
    trimmed
  )
}

function regexFallback(trimmed: string): ParsedCustomerIntent {
  const skuFromText = extractSku(trimmed)
  const colorFromText = extractColor(trimmed)
  const sizeFromText = extractSize(trimmed)
  const categoryFromText = extractCategory(trimmed)
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
        orderProductHint: null,
        orderScope: null,
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
        orderProductHint: null,
        orderScope: null,
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
        orderProductHint: null,
        orderScope: null,
      },
      trimmed
    )
  }

  const orderNumberFromText = extractOrderNumber(trimmed)
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
        orderProductHint,
        orderScope,
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
        orderProductHint: null,
        orderScope: null,
      },
      trimmed
    )
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
      orderProductHint: null,
      orderScope: null,
    },
    trimmed
  )
}

function buildIntentPrompt(text: string, recentMessages?: ConversationHistoryLine[]): string {
  if (!recentMessages?.length) return text
  const history = recentMessages
    .map((m) => `${m.role === 'customer' ? 'Customer' : 'Store'}: ${m.text}`)
    .join('\n')
  return `Recent conversation (for context — resolve follow-ups like color-only replies):\n${history}\n\nLatest customer message:\n${text}`
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
        orderProductHint: null,
        orderScope: null,
        offTopicReason: 'general',
      },
      trimmed
    )
  }

  if (isLanguageMetaQuestion(trimmed)) {
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
