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

function formatOrdersFacts(orders: OrderWithDetails[], currency: string): string {
  if (orders.length === 0) return 'No matching orders found for this WhatsApp number.'
  return orders
    .map((order, index) => `--- Order ${index + 1} ---\n${formatOrderFactsBlock(order, currency)}`)
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
    groups.push(await findRecentOrdersForCustomers(store.id, customerIds, 8))

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

  groups.push(await findRecentOrdersByShippingPhone(store.id, variants, 8))

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
  const orders = await collectOrders({
    store,
    customerPhone,
    intent,
    conversationId: input.conversationId,
  })

  const hints = [
    intent.orderNumber ? `requested order number: ${intent.orderNumber}` : null,
    intent.orderNumberHint ? `requested order suffix: ${intent.orderNumberHint}` : null,
    intent.orderProductHint ? `product hint: ${intent.orderProductHint}` : null,
    intent.orderScope ? `scope hint: ${intent.orderScope}` : null,
  ]
    .filter(Boolean)
    .join('; ')

  const factsHeader = hints ? `Lookup hints: ${hints}\n\n` : ''
  const orderFacts = `${factsHeader}${formatOrdersFacts(orders, store.currency)}`

  return buildLocalizedReply({
    customerLanguage: intent.customerLanguage,
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
    },
  })
}
