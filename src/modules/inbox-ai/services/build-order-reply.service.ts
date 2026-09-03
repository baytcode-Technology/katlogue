import * as customerRepository from '../../customers/repositories/customer.repository.js'
import {
  findOrderByNumberForCustomers,
  findOrdersByNumberSuffixForCustomers,
  findRecentOrdersByShippingPhone,
  findRecentOrdersForCustomers,
  mergeOrderDetails,
  type OrderWithDetails,
} from '../../orders/repositories/order.repository.js'
import type { OrderItem } from '../../orders/types/order.types.js'
import type { Store } from '../../stores/types/store.types.js'
import { formatMoney } from '../../../shared/utils/storefront.js'
import { phoneLookupVariants, phoneTail } from '../../../shared/utils/phone.js'
import { allowTypedPhoneLookup } from '../typed-phone-limit.js'
import { buildLocalizedReply } from './build-localized-reply.service.js'
import { getStoreHomeUrl } from './catalog-search.service.js'
import type {
  OrderScope,
  ParsedCustomerIntent,
} from './parse-customer-intent.service.js'

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

function readAddressField(addr: Record<string, unknown>, key: string): string | null {
  const value = addr[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function formatRecipientAddress(addr: Record<string, unknown> | null | undefined): {
  name: string | null
  address: string | null
} {
  if (!addr || typeof addr !== 'object') return { name: null, address: null }
  const name = readAddressField(addr, 'name')
  const parts = ['address', 'city', 'district', 'state', 'postcode']
    .map((key) => readAddressField(addr, key))
    .filter((part): part is string => Boolean(part))
  return { name, address: parts.length ? parts.join(', ') : null }
}

export function formatOrderFactsBlock(order: OrderWithDetails, currency: string): string {
  const { name, address } = formatRecipientAddress(order.shipping_address)
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

  if (name) lines.push(`Recipient: ${name}`)
  if (address) lines.push(`Address: ${address}`)

  lines.push('Items:')
  for (const item of order.items) {
    const { productName, variantName } = parseOrderItemSnapshot(item)
    const title = variantName ? `${productName} (${variantName})` : productName
    lines.push(
      `- ${title} x${item.quantity} @ ${formatMoney(item.unit_price, currency)} = ${formatMoney(item.total_price, currency)}`
    )
  }

  lines.push(`Total: ${formatMoney(order.total, currency)}`)
  return lines.join('\n')
}

function sortOrdersNewestFirst(orders: OrderWithDetails[]): OrderWithDetails[] {
  return [...orders].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

function orderMatchesProductHint(order: OrderWithDetails, hint: string): boolean {
  const needle = hint.trim().toLowerCase()
  if (!needle) return false
  return order.items.some((item) => {
    const { productName, variantName } = parseOrderItemSnapshot(item)
    const hay = `${productName} ${variantName ?? ''}`.toLowerCase()
    return hay.includes(needle) || needle.split(/\s+/).some((token) => token.length > 2 && hay.includes(token))
  })
}

/**
 * Code picks which orders enter LLM facts. Scope is authoritative — do not rely on the model.
 */
export function selectOrdersForScope(
  orders: OrderWithDetails[],
  intent: Pick<
    ParsedCustomerIntent,
    'orderScope' | 'orderNumber' | 'orderNumberHint' | 'orderProductHint'
  >
): OrderWithDetails[] {
  const sorted = sortOrdersNewestFirst(orders)
  const scope: OrderScope = intent.orderScope ?? 'latest'

  if (scope === 'all') {
    return sorted.slice(0, 12)
  }

  if (scope === 'specific') {
    if (intent.orderNumber) {
      const exact = sorted.filter(
        (o) => o.order_number.toUpperCase() === intent.orderNumber!.toUpperCase()
      )
      if (exact.length > 0) return exact
    }
    if (intent.orderNumberHint) {
      const hint = intent.orderNumberHint.trim()
      const bySuffix = sorted.filter((o) => {
        const num = o.order_number.toUpperCase()
        return num.endsWith(`-${hint}`) || num.endsWith(hint)
      })
      if (bySuffix.length > 0) return bySuffix
    }
    return []
  }

  if (scope === 'product') {
    const hint = intent.orderProductHint?.trim()
    if (!hint) return []
    return sorted.filter((o) => orderMatchesProductHint(o, hint)).slice(0, 5)
  }

  // latest (and null treated as latest)
  return sorted.length > 0 ? [sorted[0]] : []
}

function formatOrderCompactSummary(order: OrderWithDetails, currency: string): string {
  const itemBits = order.items.slice(0, 3).map((item) => {
    const { productName, variantName } = parseOrderItemSnapshot(item)
    const title = variantName ? `${productName} (${variantName})` : productName
    return `${title} x${item.quantity}`
  })
  const more =
    order.items.length > 3 ? ` +${order.items.length - 3} more` : ''
  const itemsLabel = itemBits.length > 0 ? itemBits.join(', ') + more : '—'

  return [
    `Order number: ${order.order_number}`,
    `Placed: ${formatOrderDate(order.created_at)}`,
    `Status: ${formatOrderStatusLabel(order.order_status)}`,
    `Payment: ${formatOrderStatusLabel(order.payment_status)}`,
    `Total: ${formatMoney(order.total, currency)}`,
    `Items: ${itemsLabel}`,
  ].join(' | ')
}

export function formatOrdersFactsForScope(
  orders: OrderWithDetails[],
  currency: string,
  scope: OrderScope
): string {
  const effective: OrderScope = scope ?? 'latest'

  if (orders.length === 0) {
    return effective === 'all'
      ? 'No orders found for this WhatsApp number.'
      : 'No matching orders found for this WhatsApp number.'
  }

  if (effective === 'all') {
    const lines = [
      `Customer asked for: all orders (count=${orders.length})`,
      'List EVERY order below. State the count. Then ask which order number they want full details for.',
      '',
    ]
    for (let i = 0; i < orders.length; i += 1) {
      lines.push(`--- Order ${i + 1} ---`)
      lines.push(formatOrderCompactSummary(orders[i], currency))
    }
    return lines.join('\n')
  }

  return orders
    .map((order, index) => {
      const header =
        effective === 'latest' && orders.length === 1
          ? 'Customer asked for: latest / last order (show full details for this one only)'
          : effective === 'product'
            ? 'Customer asked about an order matching a product (show full details)'
            : 'Customer asked for a specific order (show full details)'
      return `${index === 0 ? header + '\n' : ''}--- Order ${index + 1} ---\n${formatOrderFactsBlock(order, currency)}`
    })
    .join('\n\n')
}

async function collectOrders(input: {
  store: Store
  customerPhone: string
  intent: ParsedCustomerIntent
  conversationId?: number | null
}): Promise<OrderWithDetails[]> {
  const { store, customerPhone, intent } = input
  const phones = [customerPhone]
  const trustedTail = phoneTail(customerPhone)
  const fetchLimit = intent.orderScope === 'all' ? 12 : 8

  if (intent.typedPhone) {
    const typedTail = phoneTail(intent.typedPhone)
    const allowed =
      input.conversationId == null
        ? Boolean(typedTail)
        : allowTypedPhoneLookup(store.id, input.conversationId, typedTail, trustedTail)
    if (allowed && typedTail && typedTail !== trustedTail) {
      phones.push(intent.typedPhone)
    }
  }

  const customers = (
    await Promise.all(
      phones.map((phone) => customerRepository.findCustomersByPhoneVariants(store.id, phone))
    )
  ).flat()

  const seenCustomer = new Set<number>()
  const customerIds: number[] = []
  for (const customer of customers) {
    if (seenCustomer.has(customer.id)) continue
    seenCustomer.add(customer.id)
    customerIds.push(customer.id)
  }

  const variants = phones.flatMap((phone) => phoneLookupVariants(phone, store.country))
  const groups: OrderWithDetails[][] = []

  if (customerIds.length > 0) {
    groups.push(await findRecentOrdersForCustomers(store.id, customerIds, fetchLimit))

    if (intent.orderNumber) {
      const exact = await findOrderByNumberForCustomers(
        store.id,
        customerIds,
        intent.orderNumber
      )
      if (exact) groups.push([exact])
    }

    if (intent.orderNumberHint) {
      groups.push(
        await findOrdersByNumberSuffixForCustomers(
          store.id,
          customerIds,
          intent.orderNumberHint
        )
      )
    }
  }

  groups.push(await findRecentOrdersByShippingPhone(store.id, variants, fetchLimit))

  return mergeOrderDetails(groups)
}

export async function buildOrderReply(input: {
  store: Store
  intent: ParsedCustomerIntent
  customerPhone: string
  customerMessage?: string
  conversationHistory?: string | null
  conversationId?: number | null
}): Promise<string> {
  const { store, intent, customerPhone } = input
  const homeUrl = getStoreHomeUrl(store.slug)
  const collected = await collectOrders({
    store,
    customerPhone,
    intent,
    conversationId: input.conversationId,
  })
  const scope: OrderScope = intent.orderScope ?? 'latest'
  const orders = selectOrdersForScope(collected, intent)

  const hints = [
    `orderScope: ${scope}`,
    intent.orderNumber ? `requested order number: ${intent.orderNumber}` : null,
    intent.orderNumberHint ? `requested order suffix: ${intent.orderNumberHint}` : null,
    intent.orderProductHint ? `product hint: ${intent.orderProductHint}` : null,
  ]
    .filter(Boolean)
    .join('; ')

  const factsHeader = hints ? `Lookup hints: ${hints}\n\n` : ''
  const orderFacts = `${factsHeader}${formatOrdersFactsForScope(orders, store.currency, scope)}`

  return buildLocalizedReply({
    customerLanguage: intent.customerLanguage,
    scriptStyle: intent.scriptStyle,
    customerMessage: input.customerMessage,
    fallbackLanguage: store.ai_language,
    customPrompt: store.ai_system_prompt,
    conversationHistory: input.conversationHistory,
    template: 'order_assistant',
    facts: {
      storeName: store.name,
      homeUrl,
      orderFacts,
      customerAsk: input.customerMessage ?? null,
      orderOutcome: orders.length > 0 ? 'found' : 'none',
      orderScope: scope,
    },
  })
}
