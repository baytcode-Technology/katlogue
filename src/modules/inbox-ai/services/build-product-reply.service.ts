import type { Store } from '../../stores/types/store.types.js'
import { rewriteStorefrontOrigin } from '../../../shared/utils/storefront.js'
import { applyChatSrcToUrl } from '../lib/chat-src.js'
import {
  buildLocalizedReply,
  buildProductReplyLines,
  staffClosingLine,
  type LastShownProduct,
  type LocalizedReplyTemplate,
} from './build-localized-reply.service.js'
import {
  categorySearchTerm,
  isBarePriceAsk,
  type ParsedCustomerIntent,
} from './parse-customer-intent.service.js'
import {
  isMarkedSoldProduct,
  isMarkedSoldVariant,
} from '../../products/utils/product-inventory.js'
import {
  type CatalogMatch,
  filterMatchesByScore,
  findByCategoryName,
  findBySku,
  formatOtherMatches,
  formatProductCaption,
  formatShopCategories,
  getMatchImageUrl,
  getStoreCatalogSummary,
  getStoreHomeUrl,
  pickPrimaryCatalogMatch,
  productMatchesRequestedCategory,
  resolveEffectiveSearchQuery,
  searchCatalogFromIntent,
} from './catalog-search.service.js'
import { checkMessageSafety } from './safety-filter.service.js'
import { buildOrderReply } from './build-order-reply.service.js'
import type { InboxAiChannel } from './conversation-history.service.js'

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
  lastShownProduct?: LastShownProduct | null
  shopSells?: string[]
}

type CatalogSlice = {
  searchQuery: string
  color: string | null
  size: string | null
  categoryName: string | null
  sku: string | null
}

export type CatalogOffer = {
  matches: CatalogMatch[]
  missingItem: string | null
  offeredCategory: string | null
}

export function selectCatalogOffer(input: {
  primary: CatalogMatch[]
  alternatives: Array<{ category: string; matches: CatalogMatch[] }>
  requestedItem: string | null
}): CatalogOffer {
  if (input.primary.length > 0) {
    return { matches: input.primary, missingItem: null, offeredCategory: null }
  }
  for (const alt of input.alternatives) {
    if (alt.matches.length === 0) continue
    return {
      matches: alt.matches,
      missingItem: input.requestedItem,
      offeredCategory: alt.category,
    }
  }
  return { matches: [], missingItem: null, offeredCategory: null }
}

export function composeCatalogStaffReply(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join('\n\n')
}

async function searchSlice(store: Store, slice: CatalogSlice): Promise<CatalogMatch[]> {
  const currency = store.currency
  const effectiveQuery = resolveEffectiveSearchQuery(slice.searchQuery, slice.categoryName)
  const searchIntent = {
    searchQuery: effectiveQuery,
    color: slice.color,
    size: slice.size,
    categoryName: slice.categoryName,
  }

  let matches = await searchCatalogFromIntent(store.id, store.slug, currency, searchIntent)

  if (matches.length === 0 && slice.sku) {
    const skuMatch = await findBySku(store.id, store.slug, currency, slice.sku)
    if (skuMatch) matches = [skuMatch]
  }

  if (matches.length === 0 && slice.categoryName && !slice.color) {
    matches = await findByCategoryName(store.id, store.slug, currency, slice.categoryName)
  }

  if (slice.categoryName) {
    matches = matches.filter((match) =>
      productMatchesRequestedCategory(match.product, slice.categoryName)
    )
  }

  return filterMatchesByScore(matches)
}

async function resolveCatalogOffer(
  store: Store,
  intent: ParsedCustomerIntent
): Promise<CatalogOffer> {
  const currency = store.currency

  if (intent.intent === 'sku_lookup' && intent.sku) {
    const match = await findBySku(store.id, store.slug, currency, intent.sku)
    return { matches: match ? [match] : [], missingItem: null, offeredCategory: null }
  }

  const primary = await searchSlice(store, {
    searchQuery: intent.searchQuery,
    color: intent.color,
    size: intent.size,
    categoryName: intent.categoryName,
    sku: intent.sku,
  })

  const alternatives: Array<{ category: string; matches: CatalogMatch[] }> = []
  if (primary.length === 0) {
    for (const category of intent.alternativeCategories) {
      let matches = await searchSlice(store, {
        searchQuery: categorySearchTerm(category),
        color: intent.color,
        size: intent.size,
        categoryName: category,
        sku: null,
      })
      if (matches.length === 0 && intent.color) {
        matches = await searchSlice(store, {
          searchQuery: categorySearchTerm(category),
          color: null,
          size: intent.size,
          categoryName: category,
          sku: null,
        })
      }
      alternatives.push({ category, matches })
    }
  }

  return selectCatalogOffer({
    primary,
    alternatives,
    requestedItem: intent.requestedItem || intent.categoryName,
  })
}

export async function buildProductReplyFromMatches(input: {
  matches: CatalogMatch[]
  store: Store
  intent: ParsedCustomerIntent
  customerMessage: string
  ctx?: ReplyContext
  channel?: InboxAiChannel | null
  conversationId?: number | null
  offer?: Pick<CatalogOffer, 'missingItem' | 'offeredCategory'> | null
}): Promise<ProductReplyResult> {
  const { store, intent, customerMessage } = input
  const ctx = input.ctx ?? {}
  const currency = store.currency
  const customerLanguage = intent.customerLanguage
  const scriptStyle = intent.scriptStyle
  const categoryName = input.offer?.offeredCategory || intent.categoryName
  const origin = getStoreHomeUrl(store)
  const matches = input.matches.map((match) => ({
    ...match,
    url: applyChatSrcToUrl(
      rewriteStorefrontOrigin(match.url, origin),
      input.channel,
      input.conversationId
    ),
  }))

  if (matches.length === 0) {
    return {
      primaryText: '',
      followUpText: null,
      matches: [],
      primaryMatch: null,
      imageUrl: null,
    }
  }

  const homeUrl = applyChatSrcToUrl(
    getStoreHomeUrl(store),
    input.channel,
    input.conversationId
  )
  const primary = pickPrimaryCatalogMatch(matches, categoryName)
  if (!primary) {
    return {
      primaryText: '',
      followUpText: null,
      matches: [],
      primaryMatch: null,
      imageUrl: null,
    }
  }

  const rest = matches.filter((m) => m !== primary)
  const caption = formatProductCaption(primary, currency)
  const imageUrl = getMatchImageUrl(primary)
  const missingItem = input.offer?.missingItem?.trim() || null

  if (missingItem) {
    const lead = await buildLocalizedReply({
      customerLanguage,
      scriptStyle,
      customerMessage,
      fallbackLanguage: store.ai_language,
      customPrompt: ctx.customPrompt ?? store.ai_system_prompt,
      conversationHistory: ctx.conversationHistory,
      template: 'alternative',
      facts: {
        storeName: store.name,
        homeUrl,
        requestedItem: missingItem,
        offeredItem: input.offer?.offeredCategory ?? null,
      },
    })
    const followUpText =
      rest.length > 0 ? formatOtherMatches(rest, currency) : null
    return {
      primaryText: composeCatalogStaffReply([
        lead,
        caption,
        staffClosingLine(customerLanguage, scriptStyle),
      ]),
      followUpText,
      matches,
      primaryMatch: primary,
      imageUrl,
    }
  }

  const lines = await buildProductReplyLines({
    customerLanguage,
    scriptStyle,
    customerMessage,
    fallbackLanguage: store.ai_language,
    customPrompt: ctx.customPrompt ?? store.ai_system_prompt,
    conversationHistory: ctx.conversationHistory,
    facts: {
      storeName: store.name,
      homeUrl,
      productTitle: primary.product.name,
      hasOtherOptions: rest.length > 0,
    },
  })

  const followUpText =
    rest.length > 0
      ? formatOtherMatches(rest, currency, lines.alsoFoundHeader ?? undefined)
      : null

  // Caption stays code-generated so prices and URLs are never model output; the
  // closing question is what turns a flat product dump into a sales reply.
  const primaryText = composeCatalogStaffReply([lines.intro, caption, lines.closing])

  return {
    primaryText,
    followUpText,
    matches,
    primaryMatch: primary,
    imageUrl,
  }
}

async function buildTemplateReply(input: {
  store: Store
  intent: ParsedCustomerIntent
  homeUrl: string
  customerMessage: string
  ctx: ReplyContext
  template: LocalizedReplyTemplate
  extraFacts?: {
    requestedItem?: string | null
    shopSells?: string[]
    offeredItem?: string | null
    refusalReason?: 'explicit' | 'code_request' | 'off_topic' | 'language_meta'
    missingWhy?: 'not_sold' | 'sold_out' | null
    sessionTopic?: ParsedCustomerIntent['sessionTopic']
    orderAsk?: ParsedCustomerIntent['orderAsk']
  }
}): Promise<string> {
  const { store, intent, homeUrl, ctx } = input

  return buildLocalizedReply({
    customerLanguage: intent.customerLanguage,
    scriptStyle: intent.scriptStyle,
    customerMessage: input.customerMessage,
    fallbackLanguage: store.ai_language,
    customPrompt: ctx.customPrompt ?? store.ai_system_prompt,
    conversationHistory: input.template === 'greeting' ? null : ctx.conversationHistory,
    template: input.template,
    facts: {
      storeName: store.name,
      homeUrl,
      lastShownProduct: input.template === 'greeting' ? null : ctx.lastShownProduct,
      ...input.extraFacts,
    },
  })
}

async function loadShopSells(storeId: number): Promise<string[]> {
  const summary = await getStoreCatalogSummary(storeId)
  return formatShopCategories(summary)
}

async function buildNotFoundReply(
  store: Store,
  intent: ParsedCustomerIntent,
  homeUrl: string,
  customerMessage: string,
  ctx: ReplyContext
): Promise<string> {
  const shopSells = ctx.shopSells ?? (await loadShopSells(store.id))

  return buildTemplateReply({
    store,
    intent,
    homeUrl,
    customerMessage,
    ctx,
    template: 'not_found',
    extraFacts: {
      requestedItem: intent.requestedItem,
      shopSells,
      missingWhy: intent.missingWhy ?? 'not_sold',
    },
  })
}

function catalogMatchSoldOut(match: CatalogMatch): boolean {
  if (match.variant) {
    return (
      isMarkedSoldVariant(match.product, match.variant) ||
      (match.product.track_inventory && match.variant.stock_qty <= 0)
    )
  }
  return (
    isMarkedSoldProduct(match.product) ||
    (match.product.track_inventory && match.product.stock_qty <= 0)
  )
}

async function buildRefusalReply(
  store: Store,
  intent: ParsedCustomerIntent,
  homeUrl: string,
  reason: 'explicit' | 'code_request' | 'off_topic' | 'language_meta',
  customerMessage: string,
  ctx: ReplyContext
): Promise<string> {
  return buildTemplateReply({
    store,
    intent,
    homeUrl,
    customerMessage,
    ctx,
    template: 'refusal',
    extraFacts: { refusalReason: reason },
  })
}

export async function buildProductReply(input: {
  store: Store
  customerText: string
  intent: ParsedCustomerIntent
  conversationHistory?: string | null
  lastShownProduct?: LastShownProduct | null
  channel?: InboxAiChannel
  customerPhone?: string | null
  conversationId?: number | null
  shopSells?: string[]
}): Promise<ProductReplyResult> {
  const { store, customerText, intent } = input
  const homeUrl = applyChatSrcToUrl(
    getStoreHomeUrl(store),
    input.channel,
    input.conversationId
  )
  const ctx: ReplyContext = {
    customPrompt: store.ai_system_prompt,
    conversationHistory: input.conversationHistory,
    lastShownProduct: input.lastShownProduct,
    shopSells: input.shopSells,
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

  if (intent.intent === 'refuse') {
    return {
      ...empty,
      primaryText: await buildTemplateReply({
        store,
        intent,
        homeUrl,
        customerMessage: customerText,
        ctx,
        template: 'close',
        extraFacts: { sessionTopic: intent.sessionTopic },
      }),
    }
  }

  if (intent.intent === 'language_switch') {
    if (intent.sessionTopic === 'order' && input.channel === 'whatsapp' && input.customerPhone?.trim()) {
      const orderReply = await buildOrderReply({
        store,
        intent: { ...intent, intent: 'order_status', orderAsk: intent.orderAsk ?? 'confirm_last' },
        customerPhone: input.customerPhone.trim(),
        customerMessage: customerText,
        conversationHistory: ctx.conversationHistory,
        conversationId: input.conversationId,
      })
      return { ...empty, primaryText: orderReply }
    }

    const shopSells = input.shopSells ?? (await loadShopSells(store.id))
    return {
      ...empty,
      primaryText: await buildTemplateReply({
        store,
        intent,
        homeUrl,
        customerMessage: customerText,
        ctx,
        template: 'language_switch',
        extraFacts: {
          requestedItem: intent.requestedItem,
          shopSells,
          sessionTopic: intent.sessionTopic,
          missingWhy: intent.sessionTopic === 'missing' ? 'not_sold' : intent.missingWhy,
        },
      }),
    }
  }

  if (intent.intent === 'greeting') {
    const shopSells = input.shopSells ?? (await loadShopSells(store.id))
    return {
      ...empty,
      primaryText: await buildTemplateReply({
        store,
        intent,
        homeUrl,
        customerMessage: customerText,
        ctx,
        template: 'greeting',
        extraFacts: { shopSells },
      }),
    }
  }

  // A reaction ("ok", "thanks") or a buy ask names no product, so it must never
  // reach the catalog search — that is what produced "sorry, we don't have ok".
  if (intent.intent === 'acknowledgement' || intent.intent === 'buy_intent') {
    const afterOrderOrRefuse =
      intent.intent === 'acknowledgement' &&
      (intent.sessionTopic === 'order' ||
        intent.sessionTopic === 'missing' ||
        intent.orderAsk === 'eta' ||
        intent.orderAsk === 'urgency')
    return {
      ...empty,
      primaryText: await buildTemplateReply({
        store,
        intent,
        homeUrl,
        customerMessage: customerText,
        ctx,
        template: afterOrderOrRefuse
          ? 'close'
          : intent.intent === 'buy_intent'
            ? 'buy_assist'
            : 'acknowledgement',
        extraFacts: { sessionTopic: intent.sessionTopic },
      }),
    }
  }

  if (intent.intent === 'order_status') {
    if (input.channel !== 'whatsapp' || !input.customerPhone?.trim()) {
      return {
        ...empty,
        primaryText: await buildTemplateReply({
          store,
          intent,
          homeUrl,
          customerMessage: customerText,
          ctx,
          template: 'order_needs_phone',
        }),
      }
    }

    const orderReply = await buildOrderReply({
      store,
      intent,
      customerPhone: input.customerPhone.trim(),
      customerMessage: customerText,
      conversationHistory: ctx.conversationHistory,
      conversationId: input.conversationId,
    })
    return { ...empty, primaryText: orderReply }
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

  // Safety net: anything that reached here without a product to look up would
  // otherwise search on the raw message, match nothing, and be answered with
  // "we don't have <their words>". Ask them what they need instead.
  if (
    !intent.searchQuery.trim() &&
    !intent.color &&
    !intent.categoryName &&
    !intent.sku &&
    !intent.size &&
    intent.alternativeCategories.length === 0
  ) {
    const shopSells = input.shopSells ?? (await loadShopSells(store.id))
    const template = isBarePriceAsk(customerText)
      ? 'price_ask'
      : intent.sessionTopic === 'order'
        ? 'close'
        : 'acknowledgement'
    return {
      ...empty,
      primaryText: await buildTemplateReply({
        store,
        intent,
        homeUrl,
        customerMessage: customerText,
        ctx,
        template,
        extraFacts: { shopSells, sessionTopic: intent.sessionTopic },
      }),
    }
  }

  let offer = await resolveCatalogOffer(store, intent)

  if (offer.matches.length > 0) {
    const available = offer.matches.filter((match) => !catalogMatchSoldOut(match))
    if (available.length === 0) {
      return {
        ...empty,
        primaryText: await buildNotFoundReply(
          store,
          { ...intent, missingWhy: 'sold_out' },
          homeUrl,
          customerText,
          ctx
        ),
      }
    }
    offer = { ...offer, matches: available }
  }

  if (offer.matches.length > 0) {
    const reply = await buildProductReplyFromMatches({
      matches: offer.matches,
      store,
      intent,
      customerMessage: customerText,
      ctx,
      channel: input.channel,
      conversationId: input.conversationId,
      offer,
    })
    if (reply.primaryMatch) return reply
  }

  return {
    ...empty,
    primaryText: await buildNotFoundReply(store, intent, homeUrl, customerText, ctx),
  }
}
