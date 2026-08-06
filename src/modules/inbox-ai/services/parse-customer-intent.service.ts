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
  sku: string | null
  categoryName: string | null
  wantsImage: boolean
}

const INTENT_SCHEMA = `Classify the customer message. Return JSON:
{
  "intent": "greeting" | "product_search" | "sku_lookup" | "category_search" | "image_request" | "off_topic" | "explicit",
  "searchQuery": "terms to search products",
  "sku": "SKU if mentioned or null",
  "categoryName": "category if mentioned or null",
  "wantsImage": false
}`

function isGreeting(text: string): boolean {
  return /^(hi|hello|hey|good\s+(morning|afternoon|evening)|namaste|hola)\b/i.test(text.trim())
}

function extractSku(text: string): string | null {
  const match = text.match(/\b(?:sku|code|item\s*#?)\s*[:#-]?\s*([a-z0-9-]+)/i)
  return match?.[1]?.trim() ?? null
}

export async function parseCustomerIntent(text: string): Promise<ParsedCustomerIntent> {
  const trimmed = text.trim()
  const skuFromText = extractSku(trimmed)

  if (isGreeting(trimmed)) {
    return {
      intent: 'greeting',
      searchQuery: '',
      sku: skuFromText,
      categoryName: null,
      wantsImage: false,
    }
  }

  const parsed = await completeJson<ParsedCustomerIntent>(INTENT_SCHEMA, trimmed)
  if (parsed?.intent) {
    return {
      intent: parsed.intent,
      searchQuery: parsed.searchQuery?.trim() ?? trimmed,
      sku: parsed.sku?.trim() || skuFromText,
      categoryName: parsed.categoryName?.trim() || null,
      wantsImage: parsed.wantsImage === true,
    }
  }

  if (skuFromText) {
    return {
      intent: 'sku_lookup',
      searchQuery: '',
      sku: skuFromText,
      categoryName: null,
      wantsImage: false,
    }
  }

  if (/\b(photo|image|picture|pic)\b/i.test(trimmed)) {
    return {
      intent: 'image_request',
      searchQuery: trimmed.replace(/\b(photo|image|picture|pic|send|show)\b/gi, '').trim(),
      sku: null,
      categoryName: null,
      wantsImage: true,
    }
  }

  return {
    intent: 'product_search',
    searchQuery: trimmed,
    sku: null,
    categoryName: null,
    wantsImage: false,
  }
}
