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
  OrderAsk,
  OrderScope,
  ParsedCustomerIntent,
} from './parse-customer-intent.service.js'
import type { LocalizedReplyTemplate } from './build-localized-reply.service.js'

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

  if (order.promised_by?.trim()) {
    lines.push(`Promised by: ${order.promised_by.trim()}`)
  } else {
    lines.push('Delivery date: not on this order')
  }
  if (order.delay_note?.trim()) lines.push(`Delay note: ${order.delay_note.trim()}`)
  if (order.courier_name?.trim()) lines.push(`Courier: ${order.courier_name.trim()}`)
  if (order.tracking_url?.trim()) lines.push(`Tracking link: ${order.tracking_url.trim()}`)

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

/** Short card for the model — not the WhatsApp dump the customer already saw. */
export function formatOrderFactCard(order: OrderWithDetails, currency: string): string {
  const tracking = order.tracking_number?.trim()
  return [
    `Order number: ${order.order_number}`,
    `Placed: ${formatOrderDate(order.created_at)}`,
    `Order status: ${formatOrderStatusLabel(order.order_status)}`,
    `Payment status: ${formatOrderStatusLabel(order.payment_status)}`,
    `Fulfillment: ${formatOrderStatusLabel(order.fulfillment_status)}`,
    `Payment method: ${formatPaymentProviderLabel(order.payment?.provider)}`,
    `Tracking: ${tracking ? tracking : 'none on this order'}`,
    `Tracking URL: ${order.tracking_url?.trim() ? order.tracking_url.trim() : 'none on this order'}`,
    `Courier: ${order.courier_name?.trim() ? order.courier_name.trim() : 'none on this order'}`,
    `Promised by: ${order.promised_by?.trim() ? order.promised_by.trim() : 'not set — do not invent a date'}`,
    `Delay note: ${order.delay_note?.trim() ? order.delay_note.trim() : 'none'}`,
    `Delivery date on this order: ${order.promised_by?.trim() ? order.promised_by.trim() : 'not on this order'}`,
    `Total: ${formatMoney(order.total, currency)}`,
  ].join('\n')
}

const COPIED_FACT_LINE =
  /^(?:[\s*•\-]+)?(?:order number|placed(?: on)?|order status|payment status|fulfillment|payment method|recipient|address|items?|total|delivery date|tracking(?: url| link)?|shipping|promised by|delay note|courier)\s*:/i

/** Drop a rewritten facts dump from the spoken wrap so code can paste one block. */
export function stripCopiedOrderFacts(spoken: string): string {
  const kept = spoken.split('\n').filter((line) => {
    const trimmed = line.trim()
    if (!trimmed) return true
    if (COPIED_FACT_LINE.test(trimmed)) return false
    if (/^[•*]\s+/.test(trimmed) && /₹|x\d|OCT|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|NOV|DEC/i.test(trimmed)) {
      return false
    }
    return true
  })
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function redactOrderHistory(history: string | null | undefined): string | null {
  if (!history?.trim()) return null
  return history.replace(
    /Store:[\s\S]*?(?=\nCustomer:|$)/g,
    (block) =>
      /\bOrder number\s*:/i.test(block)
        ? 'Store: [order details already sent — do not copy]\n'
        : block
  )
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

export async function collectOrders(input: {
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
  const homeUrl = getStoreHomeUrl(store)
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

  const orderAsk: OrderAsk = intent.orderAsk ?? 'full'
  const template = orderTemplateForAsk(orderAsk, orders.length > 0)
  const attachBlock = template === 'order_wrap' && orders.length > 0 && orderAsk === 'full'
  const first = orders[0] ?? null
  const modelFacts = first
    ? `${hints ? `Lookup hints: ${hints}\n` : ''}Ask hint: ${orderAsk}\n${formatOrderFactCard(first, store.currency)}`
    : `${hints ? `Lookup hints: ${hints}\n\n` : ''}${formatOrdersFactsForScope(orders, store.currency, scope)}`

  const spoken = await buildLocalizedReply({
    customerLanguage: intent.customerLanguage,
    scriptStyle: intent.scriptStyle,
    customerMessage: input.customerMessage,
    fallbackLanguage: store.ai_language,
    customPrompt: store.ai_system_prompt,
    conversationHistory: redactOrderHistory(input.conversationHistory),
    template,
    facts: {
      storeName: store.name,
      homeUrl,
      orderFacts: modelFacts,
      customerAsk: input.customerMessage ?? null,
      orderOutcome: orders.length > 0 ? 'found' : 'none',
      orderScope: scope,
      orderAsk,
      sessionTopic: 'order',
    },
  })

  const cleaned = stripCopiedOrderFacts(spoken)
  if (!attachBlock) return cleaned
  const plainBlock = first ? formatOrderFactsBlock(first, store.currency) : cleaned
  return cleaned ? `${cleaned}\n\n${plainBlock}` : plainBlock
}

function orderTemplateForAsk(orderAsk: OrderAsk, found: boolean): LocalizedReplyTemplate {
  if (!found) return 'order_assistant'
  if (orderAsk === 'cancel' || orderAsk === 'address' || orderAsk === 'not_mine' || orderAsk === 'refund') {
    return 'order_help'
  }
  if (orderAsk === 'full') return 'order_wrap'
  return 'order_followup'
}
