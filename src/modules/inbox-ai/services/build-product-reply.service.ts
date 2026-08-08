import type { Store } from '../../stores/types/store.types.js'
import { completeWithFallback } from '../../../shared/llm/index.js'
import { buildInboxSystemPrompt } from './build-inbox-system-prompt.js'
import type { ParsedCustomerIntent } from './parse-customer-intent.service.js'
import {
  type CatalogMatch,
  findByCategoryName,
  findBySku,
  formatOtherMatches,
  formatProductCaption,
  getMatchImageUrl,
  getStoreHomeUrl,
  searchCatalogFromIntent,
} from './catalog-search.service.js'
import { checkMessageSafety, refusalMessage } from './safety-filter.service.js'

export type ProductReplyResult = {
  /** Primary text (caption for image, or standalone text message) */
  primaryText: string
  /** Optional follow-up text (e.g. other matches) */
  followUpText: string | null
  matches: CatalogMatch[]
  primaryMatch: CatalogMatch | null
  imageUrl: string | null
}

function buildGreeting(store: Store, homeUrl: string): string {
  const lang = store.ai_language?.trim() || 'English'
  const isHindi =
    lang.toLowerCase().startsWith('hi') || lang.toLowerCase() === 'hindi'

  if (isHindi) {
    return `नमस्ते! ${store.name} में आपका स्वागत है।\n\nहमारी दुकान: ${homeUrl}\n\nआज आप क्या खोज रहे हैं? शर्ट, पैंट, साइज, रंग या SKU बताएं।`
  }

  return `Hello! Welcome to ${store.name}.\n\nBrowse our store: ${homeUrl}\n\nWhat are you looking for? Tell me a product name, color, size, or SKU and I'll find it for you.`
}

function buildNoMatchMessage(storeName: string, homeUrl: string): string {
  return `Sorry, I couldn't find a matching product at ${storeName}.\n\nBrowse our full store here: ${homeUrl}`
}

export function buildProductReplyFromMatches(
  matches: CatalogMatch[],
  currency: string
): ProductReplyResult {
  if (matches.length === 0) {
    return {
      primaryText: '',
      followUpText: null,
      matches: [],
      primaryMatch: null,
      imageUrl: null,
    }
  }

  const [best, ...rest] = matches
  const caption = formatProductCaption(best, currency)
  const imageUrl = getMatchImageUrl(best)
  const followUpText = rest.length > 0 ? formatOtherMatches(rest, currency) : null

  return {
    primaryText: caption,
    followUpText,
    matches,
    primaryMatch: best,
    imageUrl,
  }
}

async function resolveMatches(
  store: Store,
  customerText: string,
  intent: ParsedCustomerIntent
): Promise<CatalogMatch[]> {
  const currency = store.currency

  if (intent.intent === 'sku_lookup' && intent.sku) {
    const match = await findBySku(store.id, store.slug, currency, intent.sku)
    return match ? [match] : []
  }

  if (intent.intent === 'category_search' && intent.categoryName) {
    return findByCategoryName(store.id, store.slug, currency, intent.categoryName)
  }

  let matches = await searchCatalogFromIntent(store.id, store.slug, currency, intent)

  if (matches.length === 0 && intent.categoryName) {
    matches = await findByCategoryName(store.id, store.slug, currency, intent.categoryName)
  }

  if (matches.length === 0 && intent.sku) {
    const skuMatch = await findBySku(store.id, store.slug, currency, intent.sku)
    if (skuMatch) matches = [skuMatch]
  }

  if (matches.length === 0) {
    const fallbackQuery = intent.searchQuery || customerText
    matches = await searchCatalogFromIntent(store.id, store.slug, currency, {
      searchQuery: fallbackQuery,
      color: intent.color,
      size: intent.size,
    })
  }

  return matches
}

export async function buildProductReply(input: {
  store: Store
  customerText: string
  intent: ParsedCustomerIntent
}): Promise<ProductReplyResult> {
  const { store, customerText, intent } = input
  const homeUrl = getStoreHomeUrl(store.slug)
  const currency = store.currency

  const safety = checkMessageSafety(customerText)
  if (!safety.allowed) {
    return {
      primaryText: refusalMessage(safety.reason, store.name),
      followUpText: null,
      matches: [],
      primaryMatch: null,
      imageUrl: null,
    }
  }

  if (intent.intent === 'explicit') {
    return {
      primaryText: refusalMessage('explicit', store.name),
      followUpText: null,
      matches: [],
      primaryMatch: null,
      imageUrl: null,
    }
  }

  if (intent.intent === 'off_topic') {
    return {
      primaryText: refusalMessage('off_topic', store.name),
      followUpText: null,
      matches: [],
      primaryMatch: null,
      imageUrl: null,
    }
  }

  if (intent.intent === 'greeting') {
    return {
      primaryText: buildGreeting(store, homeUrl),
      followUpText: null,
      matches: [],
      primaryMatch: null,
      imageUrl: null,
    }
  }

  const matches = await resolveMatches(store, customerText, intent)

  if (matches.length > 0) {
    return buildProductReplyFromMatches(matches, currency)
  }

  const systemPrompt = buildInboxSystemPrompt({
    storeName: store.name,
    storeSlug: store.slug,
    currency,
    language: store.ai_language ?? 'English',
    customPrompt: store.ai_system_prompt,
    homeUrl,
  })

  const llmReply = await completeWithFallback(systemPrompt, [
    { role: 'user', content: customerText },
  ])

  const trimmedReply = llmReply.trim()
  return {
    primaryText: trimmedReply || buildNoMatchMessage(store.name, homeUrl),
    followUpText: null,
    matches: [],
    primaryMatch: null,
    imageUrl: null,
  }
}
