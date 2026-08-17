import * as customerRepository from '../../customers/repositories/customer.repository.js'
import {
  findOrderByNumberForCustomer,
  findRecentOrdersForCustomer,
  type OrderWithDetails,
} from '../../orders/repositories/order.repository.js'
import type { OrderItem } from '../../orders/types/order.types.js'
import type { Store } from '../../stores/types/store.types.js'
import { formatMoney } from '../../../shared/utils/storefront.js'
import { buildLocalizedReply } from './build-localized-reply.service.js'
import { getStoreHomeUrl } from './catalog-search.service.js'
import type { ParsedCustomerIntent } from './parse-customer-intent.service.js'

type ParsedSnapshot = {
  productName: string
  variantName: string | null
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  confirming: 'Confirming',
  partially_paid: 'Partially paid',
  paid: 'Paid',
  refunded: 'Refunded',
  unfulfilled: 'Unfulfilled',
  ready: 'Ready',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  fulfilled: 'Fulfilled',
}

export function formatOrderStatusLabel(value: string): string {
  return STATUS_LABELS[value] ?? value.replace(/_/g, ' ')
}

export function formatPaymentProviderLabel(provider: string | null | undefined): string {
  switch (provider) {
    case 'manual':
      return 'COD'
    case 'upi_manual':
      return 'UPI'
    case 'razorpay':
      return 'Razorpay'
    default:
      return provider?.trim() ? formatOrderStatusLabel(provider) : 'Unknown'
  }
}

export function parseOrderItemSnapshot(item: OrderItem): ParsedSnapshot {
  const snapshot = item.snapshot
  if (!snapshot || typeof snapshot !== 'object') {
    return { productName: 'Product', variantName: null }
  }

  const record = snapshot as Record<string, unknown>
  const product = record.product as { name?: string } | undefined
  const variant = record.variant as { name?: string } | null | undefined
  const legacyProductName =
    typeof record.product_name === 'string' ? record.product_name : undefined
  const legacyVariantName =
    typeof record.variant_name === 'string' ? record.variant_name : undefined

  const productName = product?.name?.trim() || legacyProductName?.trim() || 'Product'
  const variantName = variant?.name?.trim() || legacyVariantName?.trim() || null

  return { productName, variantName }
}

function formatOrderDate(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const time = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return `${date} ${time}`
}

export function formatOrderFactsBlock(order: OrderWithDetails, currency: string): string {
  const lines: string[] = [
    `Order number: ${order.order_number}`,
    `Placed: ${formatOrderDate(order.created_at)}`,
    `Order status: ${formatOrderStatusLabel(order.order_status)}`,
    `Payment status: ${formatOrderStatusLabel(order.payment_status)}`,
    `Fulfillment: ${formatOrderStatusLabel(order.fulfillment_status)}`,
  ]

  if (order.payment?.provider) {
    lines.push(`Payment method: ${formatPaymentProviderLabel(order.payment.provider)}`)
  }

  if (order.shipping_method?.trim()) {
    lines.push(`Shipping: ${order.shipping_method.trim()}`)
  }

  if (order.tracking_number?.trim()) {
    lines.push(`Tracking: ${order.tracking_number.trim()}`)
  }

  lines.push('Items:')
  for (const item of order.items) {
    const { productName, variantName } = parseOrderItemSnapshot(item)
    const title = variantName ? `${productName} (${variantName})` : productName
    lines.push(
      `- ${title} x${item.quantity} — ${formatMoney(item.total_price, currency)}`
    )
  }

  lines.push(`Total: ${formatMoney(order.total, currency)}`)
  return lines.join('\n')
}

export function scoreOrderForHint(order: OrderWithDetails, hint: string): number {
  const normalizedHint = hint.toLowerCase().trim()
  if (!normalizedHint) return 0

  let score = 0
  for (const item of order.items) {
    const { productName, variantName } = parseOrderItemSnapshot(item)
    const haystack = `${productName} ${variantName ?? ''}`.toLowerCase()
    if (haystack.includes(normalizedHint)) score += 10
    for (const word of normalizedHint.split(/\s+/)) {
      if (word.length > 2 && haystack.includes(word)) score += 3
    }
  }
  return score
}

function pickOrderByProductHint(
  orders: OrderWithDetails[],
  hint: string
): { kind: 'found'; order: OrderWithDetails } | { kind: 'clarify'; orderNumbers: string[] } | { kind: 'none' } {
  const scored = orders
    .map((order) => ({ order, score: scoreOrderForHint(order, hint) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) return { kind: 'none' }

  const topScore = scored[0].score
  const topMatches = scored.filter((entry) => entry.score === topScore)

  if (topMatches.length === 1 && topScore >= 3) {
    return { kind: 'found', order: topMatches[0].order }
  }

  if (topMatches.length > 1) {
    return {
      kind: 'clarify',
      orderNumbers: topMatches.map((entry) => entry.order.order_number),
    }
  }

  return { kind: 'none' }
}

type ReplyContext = {
  customerMessage?: string
  conversationHistory?: string | null
  customPrompt?: string | null
}

async function buildOrderTemplateReply(
  store: Store,
  intent: ParsedCustomerIntent,
  template:
    | 'order_found'
    | 'order_clarify'
    | 'order_not_found'
    | 'order_unverified',
  facts: {
    orderFacts?: string
    clarifyOrderNumbers?: string[]
  },
  ctx: ReplyContext
): Promise<string> {
  const homeUrl = getStoreHomeUrl(store.slug)
  return buildLocalizedReply({
    customerLanguage: intent.customerLanguage,
    customerMessage: ctx.customerMessage,
    fallbackLanguage: store.ai_language,
    customPrompt: ctx.customPrompt ?? store.ai_system_prompt,
    conversationHistory: ctx.conversationHistory,
    template,
    facts: {
      storeName: store.name,
      homeUrl,
      orderFacts: facts.orderFacts ?? null,
      clarifyOrderNumbers: facts.clarifyOrderNumbers,
    },
  })
}

export async function buildOrderReply(input: {
  store: Store
  intent: ParsedCustomerIntent
  customerPhone: string
  customerMessage?: string
  conversationHistory?: string | null
}): Promise<string> {
  const { store, intent, customerPhone } = input
  const ctx: ReplyContext = {
    customerMessage: input.customerMessage,
    conversationHistory: input.conversationHistory,
    customPrompt: store.ai_system_prompt,
  }

  const customer = await customerRepository.findCustomerByPhone(store.id, customerPhone)
  if (!customer) {
    return buildOrderTemplateReply(store, intent, 'order_not_found', {}, ctx)
  }

  const scope = intent.orderScope ?? 'latest'
  const currency = store.currency

  if (scope === 'specific' && intent.orderNumber) {
    const order = await findOrderByNumberForCustomer(
      store.id,
      customer.id,
      intent.orderNumber
    )
    if (!order) {
      return buildOrderTemplateReply(store, intent, 'order_unverified', {}, ctx)
    }
    return buildOrderTemplateReply(
      store,
      intent,
      'order_found',
      { orderFacts: formatOrderFactsBlock(order, currency) },
      ctx
    )
  }

  if (scope === 'product' && intent.orderProductHint) {
    const recent = await findRecentOrdersForCustomer(store.id, customer.id, 5)
    if (recent.length === 0) {
      return buildOrderTemplateReply(store, intent, 'order_not_found', {}, ctx)
    }

    const match = pickOrderByProductHint(recent, intent.orderProductHint)
    if (match.kind === 'found') {
      return buildOrderTemplateReply(
        store,
        intent,
        'order_found',
        { orderFacts: formatOrderFactsBlock(match.order, currency) },
        ctx
      )
    }
    if (match.kind === 'clarify') {
      return buildOrderTemplateReply(
        store,
        intent,
        'order_clarify',
        { clarifyOrderNumbers: match.orderNumbers },
        ctx
      )
    }
    return buildOrderTemplateReply(store, intent, 'order_not_found', {}, ctx)
  }

  const recent = await findRecentOrdersForCustomer(store.id, customer.id, 1)
  if (recent.length === 0) {
    return buildOrderTemplateReply(store, intent, 'order_not_found', {}, ctx)
  }

  return buildOrderTemplateReply(
    store,
    intent,
    'order_found',
    { orderFacts: formatOrderFactsBlock(recent[0], currency) },
    ctx
  )
}
