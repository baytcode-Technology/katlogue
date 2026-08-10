import { completeJson } from '../../../shared/llm/index.js'

export type CustomerIntent =
  | 'greeting'
  | 'product_search'
  | 'sku_lookup'
  | 'category_search'
  | 'image_request'
  | 'off_topic'
  | 'explicit'

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
}

const INTENT_SCHEMA = `You classify customer messages for a store WhatsApp/Instagram inbox.

CRITICAL — Language:
- Detect the EXACT language the customer wrote in.
- If they write in Mongolian → customerLanguage: "Mongolian"
- If they write in Malayalam → customerLanguage: "Malayalam"
- If they write in Punjabi → customerLanguage: "Punjabi"
- If they write in Hindi → customerLanguage: "Hindi"
- If they write in English → customerLanguage: "English"
- NEVER assign a different language than what the customer used.

CRITICAL — Extract product only:
- IGNORE personal stories, events, reasons (wedding, party, tomorrow, gift, birthday, etc.)
- "I have a wedding tomorrow, I need a white shirt" → product_search, searchQuery: "shirt", color: "white", requestedItem: "white shirt"
- Only extract what product they want to buy.

Normalize product search terms to English for database lookup.

Return JSON only:
{
  "intent": "greeting" | "product_search" | "sku_lookup" | "category_search" | "image_request" | "off_topic" | "explicit",
  "customerLanguage": "exact language name e.g. English, Hindi, Malayalam, Tamil, Mongolian, Punjabi, Arabic",
  "requestedItem": "product they want in English e.g. white shirt, or null",
  "searchQuery": "English product terms without color/size e.g. shirt",
  "color": "English color e.g. white, black, or null",
  "size": "S, M, L, XL, or null",
  "sku": "SKU if mentioned or null",
  "categoryName": "English category e.g. shirts, pants, or null",
  "wantsImage": true if they ask for photo/image
}

Rules:
- Any product availability, price, or shopping question = product_search (NOT off_topic), even with personal context.
- Messages in any language about products = product_search.
- off_topic only for messages with NO shopping intent at all.
- explicit only for sexual/violent/harassing content.`

const GREETING_PATTERN =
  /^(hi|hello|hey|hii|helo|good\s+(morning|afternoon|evening)|namaste|vanakkam|hola|assalam|salam|നമസ്കാരം|ഹലോ|नमस्ते|হ্যালো)\b/i

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

const CATEGORY_WORDS = [
  'shirt', 'shirts', 'pant', 'pants', 'trouser', 'trousers', 'jeans',
  'dress', 'dresses', 'kurta', 'saree', 'sari', 'top', 'tops',
  'jacket', 'jackets', 'shoe', 'shoes', 'benny', 'beanie', 't-shirt', 'tshirt', 'innerwear',
]

function isGreeting(text: string): boolean {
  return GREETING_PATTERN.test(text.trim())
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
    /\b(photo|image|picture|pic|send|show|want|need|looking\s+for|do\s+you\s+have|price|how\s+much|wedding|party|tomorrow|birthday|gift)\b/gi,
    ' '
  )
  return q.replace(/\s+/g, ' ').trim()
}

function wantsImageFromText(text: string): boolean {
  return /\b(photo|image|picture|pic|send\s+me|show\s+me)\b/i.test(text)
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
  if (intent === 'off_topic' && hasProductSignals) return 'product_search'
  return intent
}

function finalizeIntent(
  partial: Omit<ParsedCustomerIntent, 'requestedItem'> & { requestedItem?: string | null },
  _trimmed: string
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

  return {
    ...partial,
    intent: normalizeIntent(partial.intent, hasProductSignals),
    customerLanguage: partial.customerLanguage?.trim() || 'English',
    requestedItem,
    searchQuery: partial.searchQuery.trim(),
    color: partial.color?.trim() || null,
    size: partial.size?.trim()?.toUpperCase() || null,
    sku: partial.sku?.trim() || null,
    categoryName: partial.categoryName?.trim() || null,
  }
}

function fromLlmResult(parsed: LlmIntentResult, trimmed: string): ParsedCustomerIntent {
  const colorFromText = extractColor(trimmed)
  const sizeFromText = extractSize(trimmed)
  const categoryFromText = extractCategory(trimmed)
  const skuFromText = extractSku(trimmed)

  const color = parsed.color?.trim() || colorFromText
  const size = parsed.size?.trim()?.toUpperCase() || sizeFromText
  const categoryName = parsed.categoryName?.trim() || categoryFromText
  const searchQuery =
    parsed.searchQuery?.trim() ||
    stripExtractedTerms(trimmed, color, size) ||
    categoryName ||
    ''

  return finalizeIntent(
    {
      intent: parsed.intent ?? 'product_search',
      customerLanguage: parsed.customerLanguage ?? 'English',
      requestedItem: parsed.requestedItem ?? null,
      searchQuery,
      color,
      size,
      sku: parsed.sku?.trim() || skuFromText,
      categoryName,
      wantsImage: parsed.wantsImage === true || wantsImageFromText(trimmed),
    },
    trimmed
  )
}

function englishFallback(trimmed: string): ParsedCustomerIntent {
  const skuFromText = extractSku(trimmed)
  const colorFromText = extractColor(trimmed)
  const sizeFromText = extractSize(trimmed)
  const categoryFromText = extractCategory(trimmed)

  if (isGreeting(trimmed)) {
    return finalizeIntent(
      {
        intent: 'greeting',
        customerLanguage: 'English',
        searchQuery: '',
        color: null,
        size: null,
        sku: skuFromText,
        categoryName: null,
        wantsImage: false,
      },
      trimmed
    )
  }

  if (skuFromText) {
    return finalizeIntent(
      {
        intent: 'sku_lookup',
        customerLanguage: 'English',
        searchQuery: '',
        color: colorFromText,
        size: sizeFromText,
        sku: skuFromText,
        categoryName: categoryFromText,
        wantsImage: wantsImageFromText(trimmed),
      },
      trimmed
    )
  }

  const searchQuery =
    stripExtractedTerms(trimmed, colorFromText, sizeFromText) || categoryFromText || trimmed

  return finalizeIntent(
    {
      intent: 'product_search',
      customerLanguage: 'English',
      searchQuery,
      color: colorFromText,
      size: sizeFromText,
      sku: null,
      categoryName: categoryFromText,
      wantsImage: wantsImageFromText(trimmed),
    },
    trimmed
  )
}

export async function parseCustomerIntent(text: string): Promise<ParsedCustomerIntent> {
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
      },
      trimmed
    )
  }

  const parsed = await completeJson<LlmIntentResult>(INTENT_SCHEMA, trimmed)
  if (parsed?.intent && parsed.customerLanguage) {
    return fromLlmResult(parsed, trimmed)
  }

  if (parsed?.intent) {
    return fromLlmResult({ ...parsed, customerLanguage: parsed.customerLanguage ?? 'English' }, trimmed)
  }

  return englishFallback(trimmed)
}
