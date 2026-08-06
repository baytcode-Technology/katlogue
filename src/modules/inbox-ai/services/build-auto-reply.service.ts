import type { Store } from '../../stores/types/store.types.js'
import { completeWithFallback } from '../../../shared/llm/index.js'
import { buildInboxSystemPrompt } from './build-inbox-system-prompt.js'
import type { ParsedCustomerIntent } from './parse-customer-intent.service.js'
import {
  type CatalogMatch,
  findByCategoryName,
  findBySku,
  formatCatalogMatches,
  getStoreHomeUrl,
  searchCatalog,
} from './catalog-search.service.js'
import { checkMessageSafety, refusalMessage } from './safety-filter.service.js'

export async function buildAutoReplyText(input: {
  store: Store
  customerText: string
  intent: ParsedCustomerIntent
}): Promise<{ text: string; matches: CatalogMatch[]; wantsImage: boolean }> {
  const { store, customerText, intent } = input
  const homeUrl = getStoreHomeUrl(store.slug)
  const currency = store.currency

  const safety = checkMessageSafety(customerText)
  if (!safety.allowed) {
    return { text: refusalMessage(safety.reason, store.name), matches: [], wantsImage: false }
  }

  if (intent.intent === 'explicit') {
    return {
      text: refusalMessage('explicit', store.name),
      matches: [],
      wantsImage: false,
    }
  }

  if (intent.intent === 'off_topic') {
    return {
      text: refusalMessage('off_topic', store.name),
      matches: [],
      wantsImage: false,
    }
  }

  if (intent.intent === 'greeting') {
    const lang = store.ai_language?.trim() || 'English'
    const greeting =
      lang.toLowerCase().startsWith('hi') || lang.toLowerCase() === 'hindi'
        ? `नमस्ते! ${store.name} में आपका स्वागत है। आज आप क्या खोज रहे हैं?`
        : `Hello! Welcome to ${store.name}. What product can I help you find today?`
    return { text: greeting, matches: [], wantsImage: false }
  }

  let matches: CatalogMatch[] = []

  if (intent.intent === 'sku_lookup' && intent.sku) {
    const match = await findBySku(store.id, store.slug, currency, intent.sku)
    if (match) matches = [match]
  } else if (intent.intent === 'category_search' && intent.categoryName) {
    matches = await findByCategoryName(store.id, store.slug, currency, intent.categoryName)
  } else {
    const query = intent.searchQuery || customerText
    matches = await searchCatalog(store.id, store.slug, currency, query)
    if (matches.length === 0 && intent.categoryName) {
      matches = await findByCategoryName(store.id, store.slug, currency, intent.categoryName)
    }
    if (matches.length === 0 && intent.sku) {
      const skuMatch = await findBySku(store.id, store.slug, currency, intent.sku)
      if (skuMatch) matches = [skuMatch]
    }
  }

  if (matches.length > 0) {
    const catalogBlock = formatCatalogMatches(matches, currency)
    const intro =
      matches.length === 1
        ? 'Here is what I found for you:'
        : `Here are ${matches.length} products that might interest you:`
    return {
      text: `${intro}\n\n${catalogBlock}`,
      matches,
      wantsImage: intent.wantsImage,
    }
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
  if (!trimmedReply) {
    return {
      text: `I couldn't find a matching product. Browse our store here: ${homeUrl}`,
      matches: [],
      wantsImage: intent.wantsImage,
    }
  }

  return {
    text: trimmedReply,
    matches: [],
    wantsImage: intent.wantsImage,
  }
}
