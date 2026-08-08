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
Detect the language the customer is writing in and normalize product search terms to English for database lookup.

Return JSON only:
{
  "intent": "greeting" | "product_search" | "sku_lookup" | "category_search" | "image_request" | "off_topic" | "explicit",
  "customerLanguage": "language name e.g. English, Hindi, Malayalam, Tamil, Mongolian",
  "requestedItem": "what product they want in English e.g. white shirt, black benny, t-shirt, or null",
  "searchQuery": "English product search terms without color/size e.g. shirt, benny",
  "color": "English color if mentioned e.g. black, white, or null",
  "size": "size if mentioned e.g. S, M, L, XL, or null",
  "sku": "SKU code if mentioned or null",
  "categoryName": "English category if mentioned e.g. shirts, pants, or null",
  "wantsImage": true if they ask for photo/image/picture
}

Rules:
- Any question about products, prices, availability, colors, sizes, or shopping = product_search (NOT off_topic).
- Messages in Malayalam, Hindi, Tamil, Mongolian, Arabic, etc. asking about products = product_search.
- off_topic only for messages completely unrelated to shopping at this store.
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
  'black',
  'white',
  'blue',
  'red',
  'green',
  'yellow',
  'pink',
  'purple',
  'orange',
  'brown',
  'grey',
  'gray',
  'navy',
  'beige',
  'maroon',
  'cream',
  'gold',
  'silver',
]

const CATEGORY_WORDS = [
  'shirt',
  'shirts',
  'pant',
  'pants',
  'trouser',
  'trousers',
  'jeans',
  'dress',
  'dresses',
  'kurta',
  'saree',
  'sari',
  'top',
  'tops',
  'jacket',
  'jackets',
  'shoe',
  'shoes',
  'benny',
  'beanie',
  't-shirt',
  'tshirt',
  'innerwear',
]

const NON_LATIN = /[^\u0000-\u024F\u1E00-\u1EFF]/

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
  if (color) {
    q = q.replace(new RegExp(`\\b${color}\\b`, 'gi'), ' ')
  }
  if (size) {
    q = q.replace(SIZE_PATTERN, ' ')
  }
  q = q.replace(
    /\b(photo|image|picture|pic|send|show|want|need|looking\s+for|do\s+you\s+have|price|how\s+much)\b/gi,
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
  const item = parts.join(' ').trim()
  return item || null
}

function normalizeIntent(intent: CustomerIntent, hasProductSignals: boolean): CustomerIntent {
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

export async function parseCustomerIntent(text: string): Promise<ParsedCustomerIntent> {
  const trimmed = text.trim()
  const skuFromText = extractSku(trimmed)
  const colorFromText = extractColor(trimmed)
  const sizeFromText = extractSize(trimmed)
  const categoryFromText = extractCategory(trimmed)
  const isNonLatin = NON_LATIN.test(trimmed)

  if (isGreeting(trimmed)) {
    if (isNonLatin) {
      const parsed = await completeJson<LlmIntentResult>(INTENT_SCHEMA, trimmed)
      if (parsed?.customerLanguage) {
        return finalizeIntent(
          {
            intent: 'greeting',
            customerLanguage: parsed.customerLanguage,
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
    }

    return finalizeIntent(
      {
        intent: 'greeting',
        customerLanguage: isNonLatin ? 'Unknown' : 'English',
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

  const parsed = await completeJson<LlmIntentResult>(INTENT_SCHEMA, trimmed)
  if (parsed?.intent) {
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
        intent: parsed.intent,
        customerLanguage: parsed.customerLanguage ?? (isNonLatin ? 'Unknown' : 'English'),
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

  if (skuFromText) {
    return finalizeIntent(
      {
        intent: 'sku_lookup',
        customerLanguage: isNonLatin ? 'Unknown' : 'English',
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

  if (wantsImageFromText(trimmed)) {
    const searchQuery = stripExtractedTerms(trimmed, colorFromText, sizeFromText) || categoryFromText || trimmed
    return finalizeIntent(
      {
        intent: 'image_request',
        customerLanguage: isNonLatin ? 'Unknown' : 'English',
        searchQuery,
        color: colorFromText,
        size: sizeFromText,
        sku: null,
        categoryName: categoryFromText,
        wantsImage: true,
      },
      trimmed
    )
  }

  if (categoryFromText && !colorFromText && !sizeFromText) {
    const productTerms = stripExtractedTerms(trimmed, null, null)
    if (!productTerms || productTerms === categoryFromText) {
      return finalizeIntent(
        {
          intent: 'category_search',
          customerLanguage: isNonLatin ? 'Unknown' : 'English',
          searchQuery: categoryFromText,
          color: null,
          size: null,
          sku: null,
          categoryName: categoryFromText,
          wantsImage: false,
        },
        trimmed
      )
    }
  }

  const searchQuery = stripExtractedTerms(trimmed, colorFromText, sizeFromText) || categoryFromText || trimmed
  return finalizeIntent(
    {
      intent: 'product_search',
      customerLanguage: isNonLatin ? 'Unknown' : 'English',
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
