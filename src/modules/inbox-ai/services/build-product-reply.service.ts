import type { Store } from '../../stores/types/store.types.js'
import { buildLocalizedReply } from './build-localized-reply.service.js'
import type { ParsedCustomerIntent } from './parse-customer-intent.service.js'
import {
  type CatalogMatch,
  filterMatchesByScore,
  findByCategoryName,
  findBySku,
  formatAvailableProducts,
  formatOtherMatches,
  formatProductCaption,
  getMatchImageUrl,
  getStoreCatalogSummary,
  getStoreHomeUrl,
  searchCatalogFromIntent,
} from './catalog-search.service.js'
import { checkMessageSafety } from './safety-filter.service.js'

export type ProductReplyResult = {
  primaryText: string
  followUpText: string | null
  matches: CatalogMatch[]
  primaryMatch: CatalogMatch | null
  imageUrl: string | null
}

type ReplyContext = {
  customPrompt?: string | null
  conversationHistory?: string | null
}

async function resolveMatches(
  store: Store,
  customerText: string,
  intent: ParsedCustomerIntent
): Promise<CatalogMatch[]> {
  const currency = store.currency
  let matches: CatalogMatch[] = []

  if (intent.intent === 'sku_lookup' && intent.sku) {
    const match = await findBySku(store.id, store.slug, currency, intent.sku)
    return match ? [match] : []
  }

  if (intent.intent === 'category_search' && intent.categoryName) {
    matches = await findByCategoryName(store.id, store.slug, currency, intent.categoryName)
  } else {
    matches = await searchCatalogFromIntent(store.id, store.slug, currency, intent)

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
  }

  return filterMatchesByScore(matches)
}

export async function buildProductReplyFromMatches(
  matches: CatalogMatch[],
  currency: string,
  customerLanguage: string,
  customerMessage: string,
  store: Store,
  ctx: ReplyContext = {}
): Promise<ProductReplyResult> {
  if (matches.length === 0) {
    return {
      primaryText: '',
      followUpText: null,
      matches: [],
      primaryMatch: null,
      imageUrl: null,
    }
  }

  const homeUrl = getStoreHomeUrl(store.slug)
  const [best, ...rest] = matches
  const caption = formatProductCaption(best, currency)
  const imageUrl = getMatchImageUrl(best)

  const replyBase = {
    customerLanguage,
    customerMessage,
    fallbackLanguage: store.ai_language,
    customPrompt: ctx.customPrompt ?? store.ai_system_prompt,
    conversationHistory: ctx.conversationHistory,
  }

  const intro = await buildLocalizedReply({
    ...replyBase,
    template: 'product_intro',
    facts: { storeName: store.name, homeUrl },
  })

  const alsoFoundHeader =
    rest.length > 0
      ? await buildLocalizedReply({
          ...replyBase,
          template: 'also_found_header',
          facts: { storeName: store.name, homeUrl },
        })
      : null

  const followUpText =
    rest.length > 0 ? formatOtherMatches(rest, currency, alsoFoundHeader ?? undefined) : null

  return {
    primaryText: `${intro}\n\n${caption}`,
    followUpText,
    matches,
    primaryMatch: best,
    imageUrl,
  }
}

async function buildNotFoundReply(
  store: Store,
  intent: ParsedCustomerIntent,
  homeUrl: string,
  customerMessage: string,
  ctx: ReplyContext
): Promise<string> {
  const summary = await getStoreCatalogSummary(store.id)
  const availableProducts = formatAvailableProducts(summary)

  return buildLocalizedReply({
    customerLanguage: intent.customerLanguage,
    customerMessage,
    fallbackLanguage: store.ai_language,
    customPrompt: ctx.customPrompt ?? store.ai_system_prompt,
    conversationHistory: ctx.conversationHistory,
    template: 'not_found',
    facts: {
      storeName: store.name,
      homeUrl,
      requestedItem: intent.requestedItem,
      availableProducts,
    },
  })
}

async function buildRefusalReply(
  store: Store,
  intent: ParsedCustomerIntent,
  homeUrl: string,
  reason: 'explicit' | 'code_request' | 'off_topic' | 'language_meta',
  customerMessage: string,
  ctx: ReplyContext
): Promise<string> {
  return buildLocalizedReply({
    customerLanguage: intent.customerLanguage,
    customerMessage,
    fallbackLanguage: store.ai_language,
    customPrompt: ctx.customPrompt ?? store.ai_system_prompt,
    conversationHistory: ctx.conversationHistory,
    template: 'refusal',
    facts: {
      storeName: store.name,
      homeUrl,
      refusalReason: reason,
    },
  })
}

export async function buildProductReply(input: {
  store: Store
  customerText: string
  intent: ParsedCustomerIntent
  conversationHistory?: string | null
}): Promise<ProductReplyResult> {
  const { store, customerText, intent } = input
  const homeUrl = getStoreHomeUrl(store.slug)
  const currency = store.currency
  const ctx: ReplyContext = {
    customPrompt: store.ai_system_prompt,
    conversationHistory: input.conversationHistory,
  }
  const empty: ProductReplyResult = {
    primaryText: '',
    followUpText: null,
    matches: [],
    primaryMatch: null,
    imageUrl: null,
  }

  const safety = checkMessageSafety(customerText)
  if (!safety.allowed) {
    return {
      ...empty,
      primaryText: await buildRefusalReply(
        store,
        intent,
        homeUrl,
        safety.reason,
        customerText,
        ctx
      ),
    }
  }

  if (intent.intent === 'explicit') {
    return {
      ...empty,
      primaryText: await buildRefusalReply(store, intent, homeUrl, 'explicit', customerText, ctx),
    }
  }

  if (intent.intent === 'greeting') {
    const greeting = await buildLocalizedReply({
      customerLanguage: intent.customerLanguage,
      customerMessage: customerText,
      fallbackLanguage: store.ai_language,
      customPrompt: ctx.customPrompt,
      conversationHistory: ctx.conversationHistory,
      template: 'greeting',
      facts: { storeName: store.name, homeUrl },
    })
    return { ...empty, primaryText: greeting }
  }

  if (
    intent.intent === 'off_topic' &&
    !intent.searchQuery &&
    !intent.requestedItem &&
    !intent.categoryName &&
    !intent.sku
  ) {
    const reason =
      intent.offTopicReason === 'language_meta' ? 'language_meta' : 'off_topic'
    return {
      ...empty,
      primaryText: await buildRefusalReply(store, intent, homeUrl, reason, customerText, ctx),
    }
  }

  const matches = await resolveMatches(store, customerText, intent)

  if (matches.length > 0) {
    return buildProductReplyFromMatches(
      matches,
      currency,
      intent.customerLanguage,
      customerText,
      store,
      ctx
    )
  }

  return {
    ...empty,
    primaryText: await buildNotFoundReply(store, intent, homeUrl, customerText, ctx),
  }
}
