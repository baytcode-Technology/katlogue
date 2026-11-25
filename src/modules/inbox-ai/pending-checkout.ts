import { storefrontShippingAddressSchema } from '../../shared/validations/shipping-address.validation.js'
import { SESSION_MAX_AGE_MS } from './services/conversation-history.service.js'
import type { ConversationHistoryLine } from './services/parse-customer-intent.service.js'

export const CHECKOUT_STATUSES = [
  'need_variant',
  'choosing',
  'need_address',
  'awaiting_proof',
  'creating',
] as const

export type PendingCheckoutStatus = (typeof CHECKOUT_STATUSES)[number]

export type PendingCheckoutAddress = {
  name: string
  phone_number: string
  address: string
  city: string
  district: string
  state: string
  postcode: string
}

export type PendingCheckout = {
  status: PendingCheckoutStatus
  product_id: number
  variant_id: number | null
  quantity: number
  title: string
  address: PendingCheckoutAddress | null
  created_at: string
}

export type CheckoutVariantChoice = {
  id: number
  name: string
  options: Record<string, unknown>
}

const BUY_PHRASE =
  /\b(order cheyyam|order cheyam|order cheyyan|how to order|book it|i want to order|i want this|i want it|buy this|take this|venam)\b/i

const PRODUCT_QUESTION =
  /\b(do you have|show me|another|shirt|shirts|pant|pants|price|colour|color|catalog|catalogue)\b/i

const PRODUCT_URL_SOURCE = 'https?:\\/\\/[^\\s]+\\/product\\/[a-z0-9-]+[^\\s]*'

const ADDRESS_LABELS: Record<string, string> = {
  name: 'name',
  phone_number: 'phone',
  address: 'address',
  city: 'city',
  district: 'district',
  state: 'state',
  postcode: 'PIN',
}

function positiveInt(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isInteger(number) || number <= 0) return null
  return number
}

export function parsePendingCheckout(raw: unknown): PendingCheckout | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const status = CHECKOUT_STATUSES.find((item) => item === row.status)
  const productId = positiveInt(row.product_id)
  const quantity = positiveInt(row.quantity)
  if (!status || !productId || !quantity || quantity > 20) return null
  if (typeof row.title !== 'string' || !row.title.trim()) return null
  if (typeof row.created_at !== 'string' || Number.isNaN(Date.parse(row.created_at))) return null
  const variantId = row.variant_id == null ? null : positiveInt(row.variant_id)
  if (row.variant_id != null && !variantId) return null
  const address = parseStoredAddress(row.address)
  if (row.address != null && !address) return null
  return {
    status,
    product_id: productId,
    variant_id: variantId,
    quantity,
    title: row.title.trim(),
    address,
    created_at: row.created_at,
  }
}

function parseStoredAddress(raw: unknown): PendingCheckoutAddress | null {
  if (raw == null) return null
  const parsed = storefrontShippingAddressSchema.safeParse(raw)
  if (!parsed.success) return null
  return parsed.data
}

export function isCheckoutExpired(checkout: PendingCheckout, nowMs: number = Date.now()): boolean {
  const time = Date.parse(checkout.created_at)
  if (Number.isNaN(time)) return true
  return nowMs - time > SESSION_MAX_AGE_MS
}

export function isBuyPhrase(text: string): boolean {
  return BUY_PHRASE.test(text.trim())
}

export function buyQuantity(text: string): number {
  const match = /\b(\d{1,2})\b/.exec(text)
  if (!match) return 1
  const quantity = Number(match[1])
  if (quantity < 1 || quantity > 20) return 1
  return quantity
}

export function checkoutChoice(text: string): 'website' | 'pay_here' | null {
  const website = /\b(website|site|link|online)\b/i.test(text)
  if (website) return 'website'
  if (/\b(pay here|upi|gpay|google pay|qr code|qr|in chat|whatsapp)\b/i.test(text)) {
    return 'pay_here'
  }
  return null
}

export function isProductQuestion(text: string): boolean {
  if (checkoutChoice(text) || isBuyPhrase(text)) return false
  return PRODUCT_QUESTION.test(text)
}

export function checkoutProductFromUrl(url: string): { productId: number; variantId: number | null } | null {
  const slug = /\/product\/([a-z0-9-]+)/i.exec(url)
  if (!slug) return null
  const idMatch = /-(\d+)$/.exec(slug[1])
  const productId = idMatch ? Number(idMatch[1]) : null
  if (!productId || !Number.isInteger(productId)) return null
  const variantMatch = /[?&]variant=(\d+)/i.exec(url)
  const variantId = variantMatch ? Number(variantMatch[1]) : null
  return {
    productId,
    variantId: variantId && Number.isInteger(variantId) && variantId > 0 ? variantId : null,
  }
}

export function lastCheckoutProduct(
  lines: ConversationHistoryLine[]
): { productId: number; variantId: number | null; url: string } | null {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]
    if (line.role !== 'store') continue
    const urls = line.text.match(new RegExp(PRODUCT_URL_SOURCE, 'gi')) ?? []
    if (urls.length !== 1) continue
    const parsed = checkoutProductFromUrl(urls[0])
    if (!parsed) continue
    return { ...parsed, url: urls[0] }
  }
  return null
}

function optionValues(variant: CheckoutVariantChoice): string[] {
  const values = [variant.name]
  for (const value of Object.values(variant.options)) {
    if (typeof value === 'string' && value.trim()) values.push(value.trim())
  }
  return values
}

function mentions(text: string, value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\b)${escaped}(?:\\b|$)`, 'i').test(text)
}

export function matchCheckoutVariant(
  variants: CheckoutVariantChoice[],
  text: string
): CheckoutVariantChoice | null {
  const matches = variants.filter((variant) => optionValues(variant).some((value) => mentions(text, value)))
  if (matches.length !== 1) return null
  return matches[0]
}

export function paymentAmountMatches(catalogTotal: number, shownAmount: number): boolean {
  if (!Number.isFinite(catalogTotal) || !Number.isFinite(shownAmount)) return false
  return Math.round(catalogTotal) === Math.round(shownAmount)
}

export function readImageDecision(input: {
  checkout: PendingCheckout | null
  nowMs: number
  isPaymentSuccess: boolean
  amount: number | null
  catalogTotal: number
}): 'ignore' | 'ask_again' | 'create' {
  if (!input.checkout || input.checkout.status !== 'awaiting_proof') return 'ignore'
  if (isCheckoutExpired(input.checkout, input.nowMs)) return 'ignore'
  if (!input.isPaymentSuccess || input.amount === null) return 'ask_again'
  if (!paymentAmountMatches(input.catalogTotal, input.amount)) return 'ask_again'
  return 'create'
}

/** Second photo must not create a second order. Only awaiting_proof can move to creating. */
export function nextCheckoutClaim(
  checkout: PendingCheckout | null,
  nowMs: number = Date.now()
): PendingCheckout | null {
  if (!checkout || checkout.status !== 'awaiting_proof') return null
  if (isCheckoutExpired(checkout, nowMs)) return null
  return { ...checkout, status: 'creating' }
}

function asText(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string') return value.trim()
  return ''
}

function pick(raw: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const text = asText(raw[key])
    if (text) return text
  }
  return ''
}

export function addressFromCheckoutParse(
  raw: unknown,
  whatsappNumber: string
): { ok: true; address: PendingCheckoutAddress } | { ok: false; missing: string[] } {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const phone = pick(row, ['phone_number', 'phone']) || whatsappNumber.trim()
  const candidate = {
    name: pick(row, ['name']),
    phone_number: phone,
    address: pick(row, ['address', 'street']),
    city: pick(row, ['city']),
    district: pick(row, ['district']),
    state: pick(row, ['state']),
    postcode: pick(row, ['postcode', 'pin', 'pincode']),
  }
  const parsed = storefrontShippingAddressSchema.safeParse(candidate)
  if (parsed.success) return { ok: true, address: parsed.data }
  const missing = parsed.error.issues
    .map((issue) => issue.path[0])
    .filter((field): field is string => typeof field === 'string')
    .map((field) => ADDRESS_LABELS[field] ?? field)
  return { ok: false, missing: [...new Set(missing)] }
}
