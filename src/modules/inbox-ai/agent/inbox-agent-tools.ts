import { formatMoney } from '../../../shared/utils/storefront.js'
import {
  formatShopPolicyCustomerCopyForAsk,
  parseShopPolicies,
  type ShopPolicyAsk,
} from '../../../shared/lib/shop-policies.js'
import { parseStoredPaymentConfig } from '../../payments/lib/payment-config.js'
import type { Store } from '../../stores/types/store.types.js'
import { applyChatSrcToUrl } from '../lib/chat-src.js'
import type { InboxAiChannel } from '../services/conversation-history.service.js'
import {
  filterMatchesByScore,
  findBySku,
  searchCatalog,
  type CatalogMatch,
} from '../services/catalog-search.service.js'
import {
  collectOrders,
  formatOrderFactCard,
  selectOrdersForScope,
} from '../services/build-order-reply.service.js'
import type {
  OrderScope,
  ParsedCustomerIntent,
} from '../services/parse-customer-intent.service.js'
import type { LlmToolDefinition } from '../../../shared/llm/types.js'

export type AgentTurnState = {
  shown: CatalogMatch | null
  also: CatalogMatch[]
  found: CatalogMatch[]
  facts: string[]
  helpline: boolean
  lookedUpOrders: boolean
}

export type InboxAgentToolDeps = {
  searchCatalog?: typeof searchCatalog
  findBySku?: typeof findBySku
  collectOrders?: typeof collectOrders
}

export const INBOX_AGENT_TOOLS: LlmToolDefinition[] = [
  {
    name: 'search_products',
    description:
      'Search THIS shop catalog. Pass identifying words (style, fabric, brand, model, type). Keep "check shirt". Never put colour, color, other, or vere in the query. For "other colour shirts" after a shirt card, query is shirt.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Product words to search, e.g. check shirt' },
        color: { type: 'string', description: 'Colour if they named one, else omit' },
        size: { type: 'string', description: 'Size if they named one, else omit' },
        category: { type: 'string', description: 'Shop department only if they named one' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_product_by_sku',
    description: 'Look up one product by the exact SKU the customer typed.',
    parameters: {
      type: 'object',
      properties: {
        sku: { type: 'string', description: 'SKU exactly as typed' },
      },
      required: ['sku'],
    },
  },
  {
    name: 'show_product',
    description:
      'Send this product card (photo, price, link). Call only with a productId returned by search_products or get_product_by_sku in this turn.',
    parameters: {
      type: 'object',
      properties: {
        productId: { type: 'integer', description: 'productId from a tool result' },
        variantId: { type: 'integer', description: 'variantId from that result, or omit' },
      },
      required: ['productId'],
    },
  },
  {
    name: 'get_my_orders',
    description:
      'Look up orders for the WhatsApp number on this chat only. Never use it for a product they have not ordered.',
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          description: 'latest, all, specific, or product',
        },
        orderNumber: { type: 'string', description: 'Full order number if they gave one' },
        productHint: {
          type: 'string',
          description: 'Product identity if they named one, e.g. check shirt',
        },
      },
      required: ['scope'],
    },
  },
  {
    name: 'get_shop_info',
    description: 'Shop location, hours, delivery, payment, returns, or offers. Facts only.',
    parameters: {
      type: 'object',
      properties: {
        ask: {
          type: 'string',
          description: 'location, hours, delivery, payment, returns, offers, or general',
        },
      },
      required: ['ask'],
    },
  },
  {
    name: 'connect_helpline',
    description:
      'Customer helpline will contact them. Use only for cancel, refund, address change, or not-my-order. Do not use for a missing delivery date.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'cancel, refund, address, or not_mine' },
      },
      required: ['reason'],
    },
  },
]

const SEARCH_QUERY_FILLER = new Set([
  'colour',
  'color',
  'colours',
  'colors',
  'niram',
  'nirangal',
  'other',
  'others',
  'another',
  'different',
  'more',
  'any',
  'vere',
  'ethelum',
  'ethra',
  'okke',
  'ellaa',
  'ella',
])

export function cleanSearchQuery(query: string): string {
  const raw = query.trim()
  if (!raw) return raw
  const kept = raw.split(/\s+/).filter((token) => !SEARCH_QUERY_FILLER.has(token.toLowerCase()))
  return kept.length > 0 ? kept.join(' ') : raw
}

function argString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  return typeof value === 'string' ? value.trim() : ''
}

function argId(args: Record<string, unknown>, key: string): number | null {
  const value = args[key]
  const id = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

function matchKey(match: CatalogMatch): string {
  return `${match.product.id}:${match.variant?.id ?? 0}`
}

function publicProduct(
  match: CatalogMatch,
  currency: string,
  channel: InboxAiChannel,
  conversationId: number | null
) {
  const url = applyChatSrcToUrl(match.url, channel, conversationId)
  return {
    productId: match.product.id,
    variantId: match.variant?.id ?? null,
    name: match.product.name,
    variantName: match.variant?.name ?? null,
    price: formatMoney(match.price, currency),
    inStock: match.inStock !== false,
    url,
    category: match.categoryName ?? null,
  }
}

function orderIntent(scope: OrderScope, orderNumber: string, productHint: string): ParsedCustomerIntent {
  return {
    intent: 'order_status',
    customerLanguage: 'English',
    scriptStyle: 'latin',
    requestedItem: productHint || null,
    searchQuery: '',
    color: null,
    size: null,
    sku: null,
    categoryName: null,
    wantsImage: false,
    orderNumber: orderNumber || null,
    orderNumberHint: null,
    orderProductHint: productHint || null,
    orderScope: scope,
    orderAsk: 'full',
    typedPhone: null,
    sessionTopic: 'order',
    missingWhy: null,
    alternativeCategories: [],
    rejectsLastShown: false,
    replyToLastQuestion: null,
  }
}

function paymentFacts(store: Store): string {
  const payments = parseStoredPaymentConfig(store.payment_config)
  const cod = payments.cod?.enabled === false ? 'not enabled' : 'available'
  const upi = payments.upi?.enabled && payments.upi?.vpa ? 'available at checkout' : 'not enabled'
  const cards = payments.razorpay?.enabled ? 'available at checkout' : 'not enabled'
  return [`COD: ${cod}`, `UPI / Google Pay: ${upi}`, `Cards: ${cards}`].join('\n')
}

export function createInboxAgentTools(input: {
  store: Store
  channel: InboxAiChannel
  customerPhone: string | null
  conversationId: number | null
  deps?: InboxAgentToolDeps
}) {
  const search = input.deps?.searchCatalog ?? searchCatalog
  const skuLookup = input.deps?.findBySku ?? findBySku
  const orders = input.deps?.collectOrders ?? collectOrders
  const cache = new Map<string, CatalogMatch>()
  const state: AgentTurnState = {
    shown: null,
    also: [],
    found: [],
    facts: [],
    helpline: false,
    lookedUpOrders: false,
  }

  function markShown(match: CatalogMatch): void {
    state.shown = match
    state.also = [...cache.values()].filter(
      (row, index, all) =>
        row.product.id !== match.product.id &&
        all.findIndex((item) => item.product.id === row.product.id) === index
    )
    state.facts.push(`${match.product.name} ${formatMoney(match.price, input.store.currency)} ${match.url}`)
  }

  function remember(matches: CatalogMatch[]): void {
    for (const match of matches) {
      const linked = {
        ...match,
        url: applyChatSrcToUrl(match.url, input.channel, input.conversationId),
      }
      cache.set(matchKey(linked), linked)
      cache.set(`${linked.product.id}:0`, linked)
    }
  }

  async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (name === 'search_products') {
      const query = cleanSearchQuery(argString(args, 'query'))
      const matches = filterMatchesByScore(
        await search(input.store.id, input.store.slug, input.store.currency, {
          query,
          color: argString(args, 'color') || null,
          size: argString(args, 'size') || null,
          categoryName: argString(args, 'category') || null,
        })
      )
      remember(matches)
      state.found = matches
      const rows = matches.map((match) =>
        publicProduct(match, input.store.currency, input.channel, input.conversationId)
      )
      state.facts.push(JSON.stringify(rows))
      return { products: rows }
    }

    if (name === 'get_product_by_sku') {
      const match = await skuLookup(
        input.store.id,
        input.store.slug,
        input.store.currency,
        argString(args, 'sku')
      )
      if (!match) {
        state.facts.push('sku: none')
        return { products: [] }
      }
      remember([match])
      const row = publicProduct(match, input.store.currency, input.channel, input.conversationId)
      state.facts.push(JSON.stringify(row))
      return { products: [row] }
    }

    if (name === 'show_product') {
      const productId = argId(args, 'productId')
      const variantId = argId(args, 'variantId')
      const match =
        (productId != null
          ? cache.get(`${productId}:${variantId ?? 0}`) ?? cache.get(`${productId}:0`)
          : null) ?? null
      if (!match) return { error: 'Unknown product. Search first and use a returned productId.' }
      markShown(match)
      return { shown: match.product.name, url: match.url }
    }

    if (name === 'get_my_orders') {
      const phone = input.customerPhone?.trim()
      if (!phone) {
        const note = 'Order status can only be checked on WhatsApp from the number used at checkout.'
        state.facts.push(note)
        return { orders: [], note }
      }
      const scopeRaw = argString(args, 'scope')
      const scope: OrderScope =
        scopeRaw === 'all' || scopeRaw === 'specific' || scopeRaw === 'product' ? scopeRaw : 'latest'
      const intent = orderIntent(scope, argString(args, 'orderNumber'), argString(args, 'productHint'))
      const collected = await orders({
        store: input.store,
        customerPhone: phone,
        intent,
        conversationId: input.conversationId,
      })
      const selected = selectOrdersForScope(collected, intent)
      state.lookedUpOrders = true
      const cards = selected.map((order) => formatOrderFactCard(order, input.store.currency))
      state.facts.push(cards.join('\n') || 'no orders')
      return { orders: cards }
    }

    if (name === 'get_shop_info') {
      const askRaw = argString(args, 'ask')
      const ask: ShopPolicyAsk =
        askRaw === 'location' ||
        askRaw === 'hours' ||
        askRaw === 'delivery' ||
        askRaw === 'payment' ||
        askRaw === 'returns' ||
        askRaw === 'offers'
          ? askRaw
          : 'general'
      const policies = parseShopPolicies(input.store.shop_policies)
      const copy = formatShopPolicyCustomerCopyForAsk(policies, input.store.currency, ask)
      const payments = ask === 'payment' || ask === 'general' ? paymentFacts(input.store) : ''
      const text = [copy, payments].filter(Boolean).join('\n') || 'not set'
      state.facts.push(text)
      return { facts: text }
    }

    if (name === 'connect_helpline') {
      state.helpline = true
      const line = 'Our customer helpline will contact you. Please wait in this chat.'
      state.facts.push(line)
      return { helpline: true, say: line }
    }

    return { error: `Unknown tool ${name}` }
  }

  function showBestSearchMatch(lastShownTitle?: string | null): void {
    if (state.shown || state.found.length === 0) return
    const last = lastShownTitle?.trim().toLowerCase() ?? ''
    const pick =
      state.found.find((row) => row.product.name.toLowerCase() !== last) ?? state.found[0]
    markShown(pick)
  }

  return { state, runTool, showBestSearchMatch }
}
