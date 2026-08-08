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
  searchQuery: string
  color: string | null
  size: string | null
  sku: string | null
  categoryName: string | null
  wantsImage: boolean
}

const INTENT_SCHEMA = `Classify the customer message for a store inbox. Return JSON only:
{
  "intent": "greeting" | "product_search" | "sku_lookup" | "category_search" | "image_request" | "off_topic" | "explicit",
  "searchQuery": "product search terms without color/size words",
  "color": "color if mentioned e.g. black, blue, or null",
  "size": "size if mentioned e.g. S, M, L, XL, or null",
  "sku": "SKU if mentioned or null",
  "categoryName": "category if mentioned e.g. shirts, pants, or null",
  "wantsImage": true if they ask for photo/image/picture
}`

const GREETING_PATTERN =
  /^(hi|hello|hey|hii|helo|good\s+(morning|afternoon|evening)|namaste|vanakkam|hola|assalam|salam)\b/i

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
]

function isGreeting(text: string): boolean {
  return GREETING_PATTERN.test(text.trim())
}

function extractSku(text: string): string | null {
  const match = text.match(/\b(?:sku|code|item\s*#?)\s*[:#-]?\s*([a-z0-9-]+)/i)
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
    if (new RegExp(`\\b${cat}\\b`, 'i').test(lower)) {
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
  q = q.replace(/\b(photo|image|picture|pic|send|show|want|need|looking\s+for|do\s+you\s+have)\b/gi, ' ')
  return q.replace(/\s+/g, ' ').trim()
}

function wantsImageFromText(text: string): boolean {
  return /\b(photo|image|picture|pic|send\s+me|show\s+me)\b/i.test(text)
}

export async function parseCustomerIntent(text: string): Promise<ParsedCustomerIntent> {
  const trimmed = text.trim()
  const skuFromText = extractSku(trimmed)
  const colorFromText = extractColor(trimmed)
  const sizeFromText = extractSize(trimmed)
  const categoryFromText = extractCategory(trimmed)

  if (isGreeting(trimmed)) {
    return {
      intent: 'greeting',
      searchQuery: '',
      color: null,
      size: null,
      sku: skuFromText,
      categoryName: null,
      wantsImage: false,
    }
  }

  const parsed = await completeJson<ParsedCustomerIntent>(INTENT_SCHEMA, trimmed)
  if (parsed?.intent) {
    const color = parsed.color?.trim() || colorFromText
    const size = parsed.size?.trim()?.toUpperCase() || sizeFromText
    const categoryName = parsed.categoryName?.trim() || categoryFromText
    const searchQuery =
      parsed.searchQuery?.trim() ||
      stripExtractedTerms(trimmed, color, size) ||
      trimmed

    return {
      intent: parsed.intent,
      searchQuery,
      color,
      size,
      sku: parsed.sku?.trim() || skuFromText,
      categoryName,
      wantsImage: parsed.wantsImage === true || wantsImageFromText(trimmed),
    }
  }

  if (skuFromText) {
    return {
      intent: 'sku_lookup',
      searchQuery: '',
      color: colorFromText,
      size: sizeFromText,
      sku: skuFromText,
      categoryName: categoryFromText,
      wantsImage: wantsImageFromText(trimmed),
    }
  }

  if (wantsImageFromText(trimmed)) {
    return {
      intent: 'image_request',
      searchQuery: stripExtractedTerms(trimmed, colorFromText, sizeFromText) || trimmed,
      color: colorFromText,
      size: sizeFromText,
      sku: null,
      categoryName: categoryFromText,
      wantsImage: true,
    }
  }

  if (categoryFromText && !colorFromText && !sizeFromText) {
    const productTerms = stripExtractedTerms(trimmed, null, null)
    if (!productTerms || productTerms === categoryFromText) {
      return {
        intent: 'category_search',
        searchQuery: '',
        color: null,
        size: null,
        sku: null,
        categoryName: categoryFromText,
        wantsImage: false,
      }
    }
  }

  return {
    intent: 'product_search',
    searchQuery: stripExtractedTerms(trimmed, colorFromText, sizeFromText) || trimmed,
    color: colorFromText,
    size: sizeFromText,
    sku: null,
    categoryName: categoryFromText,
    wantsImage: wantsImageFromText(trimmed),
  }
}
