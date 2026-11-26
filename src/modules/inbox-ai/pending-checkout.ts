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

export const BOOK_PHRASE =
  /\b(order cheyyam|order cheyam|order cheyyan|order cheyyahnam|how to order|book it|book cheyy\w*|bood cheyy\w*|i want to order|i want this|i want it|buy this|take this)\b/i

export const WANT_PHRASE = /\b(venam|vehnam|vehnadth)\b/i

const QUANTITY_ASK = /\b(quantity|entha quantity|ethra venam)\b/i

const QUANTITY_ONLY = /^(?:[1-9]|1[0-9]|20)$/

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

/** Draft or full address while collecting delivery details. Empty strings are allowed. */
export function emptyAddressDraft(phone = ''): PendingCheckoutAddress {
  return {
    name: '',
    phone_number: phone.trim(),
    address: '',
    city: '',
    district: '',
    state: '',
    postcode: '',
  }
}

function parseStoredAddress(raw: unknown): PendingCheckoutAddress | null {
  if (raw == null || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  return {
    name: asText(row.name),
    phone_number: asText(row.phone_number) || asText(row.phone),
    address: asText(row.address) || asText(row.street),
    city: asText(row.city),
    district: asText(row.district),
    state: asText(row.state),
    postcode: asText(row.postcode) || asText(row.pin) || asText(row.pincode),
  }
}

export function mergeAddressDraft(
  previous: PendingCheckoutAddress | null | undefined,
  next: Partial<PendingCheckoutAddress> | null | undefined,
  phone = ''
): PendingCheckoutAddress {
  const base = previous ?? emptyAddressDraft(phone)
  const patch = next ?? {}
  return {
    name: asText(patch.name) || base.name,
    phone_number: asText(patch.phone_number) || base.phone_number || phone.trim(),
    address: asText(patch.address) || base.address,
    city: asText(patch.city) || base.city,
    district: asText(patch.district) || base.district,
    state: asText(patch.state) || base.state,
    postcode: asText(patch.postcode) || base.postcode,
  }
}

export function missingAddressFields(draft: PendingCheckoutAddress): string[] {
  const parsed = storefrontShippingAddressSchema.safeParse(draft)
  if (parsed.success) return []
  return [
    ...new Set(
      parsed.error.issues
        .map((issue) => issue.path[0])
        .filter((field): field is string => typeof field === 'string')
        .map((field) => ADDRESS_LABELS[field] ?? field)
        .filter((field) => field !== 'phone')
    ),
  ]
}

/** name, street, city, district, state, 6-digit PIN */
export function parseCommaAddress(text: string): PendingCheckoutAddress | null {
  const parts = text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length < 6) return null
  const postcode = parts[parts.length - 1].replace(/\s+/g, '')
  if (!/^\d{6}$/.test(postcode)) return null
  const state = parts[parts.length - 2]
  const district = parts[parts.length - 3]
  const city = parts[parts.length - 4]
  const name = parts[0]
  const address = parts.slice(1, parts.length - 4).join(', ')
  if (!name || !address || !city || !district || !state) return null
  return {
    name,
    phone_number: '',
    address,
    city,
    district,
    state,
    postcode,
  }
}

const FIELD_FROM_LABEL: Record<string, keyof PendingCheckoutAddress> = {
  name: 'name',
  address: 'address',
  city: 'city',
  district: 'district',
  state: 'state',
  PIN: 'postcode',
  pin: 'postcode',
  postcode: 'postcode',
}

/** One short reply after "district mathram koodi…" fills only that field. */
export function fillSingleMissingField(
  draft: PendingCheckoutAddress,
  text: string,
  missing: string[]
): PendingCheckoutAddress | null {
  if (missing.length !== 1) return null
  const key = FIELD_FROM_LABEL[missing[0]]
  if (!key) return null
  const value = text.trim()
  if (!value || value.split(/\s+/).length > 6) return null
  if (/already|ezhuthi|wrote that|same/i.test(value)) return null
  return { ...draft, [key]: value }
}

export function isAddressAlreadySaid(text: string): boolean {
  return /\b(already|i already|njaan ezhuthi|ezhuthiyath|same details|athu thanne)\b/i.test(text.trim())
}

export function isCheckoutExpired(checkout: PendingCheckout, nowMs: number = Date.now()): boolean {
  const time = Date.parse(checkout.created_at)
  if (Number.isNaN(time)) return true
  return nowMs - time > SESSION_MAX_AGE_MS
}

function lastStoreAskedQuantity(lines: ConversationHistoryLine[]): boolean {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].role !== 'store') continue
    return QUANTITY_ASK.test(lines[i].text)
  }
  return false
}

export function isQuantityReply(
  text: string,
  recentMessages: ConversationHistoryLine[] = []
): boolean {
  return QUANTITY_ONLY.test(text.trim()) && lastStoreAskedQuantity(recentMessages)
}

export function isBuyPhrase(text: string): boolean {
  return BOOK_PHRASE.test(text.trim())
}

export const QUANTITY_WORD = /^(quantity|qty|ennam|rennam|piece|pieces|pcs|nos|book)$/i

export function sizeTokens(text: string): string[] {
  return text.toLowerCase().split(/[\s,.!?]+/).filter(Boolean)
}

/** A number next to a quantity word ("1 quantity", "qty 2", "1 rennam") is a count, not a size. */
export function isQuantityNumber(tokens: string[], index: number): boolean {
  return QUANTITY_WORD.test(tokens[index + 1] ?? '') || QUANTITY_WORD.test(tokens[index - 1] ?? '')
}

export function buyQuantity(text: string): number {
  const tokens = sizeTokens(text)
  const numbers = tokens
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => /^\d{1,2}$/.test(token))
  const counted =
    numbers.find(({ index }) => isQuantityNumber(tokens, index)) ??
    numbers.find(({ index }) => !/^(size|sz)$/.test(tokens[index - 1] ?? ''))
  if (!counted) return 1
  const quantity = Number(counted.token)
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

export function isProductQuestion(
  text: string,
  recentMessages: ConversationHistoryLine[] = []
): boolean {
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

const sameValue = (a: unknown, b: unknown) =>
  String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()

/** The size they said, keeping the shown card's other options (colour). */
export function variantForSize<T extends CheckoutVariantChoice>(
  variants: T[],
  shown: T | null,
  size: string
): T | null {
  const matches = variants.filter((variant) => {
    const entries = Object.entries(variant.options)
    const sizeHit = entries.some(([key, value]) => /size/i.test(key) && sameValue(value, size))
    if (!sizeHit) return false
    if (!shown) return true
    return entries.every(([key, value]) => /size/i.test(key) || sameValue(value, shown.options[key]))
  })
  return matches.length === 1 ? matches[0] : null
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

export function addressDraftFromRaw(
  raw: unknown,
  whatsappNumber: string
): PendingCheckoutAddress {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const phone = pick(row, ['phone_number', 'phone']) || whatsappNumber.trim()
  return {
    name: pick(row, ['name']),
    phone_number: phone,
    address: pick(row, ['address', 'street']),
    city: pick(row, ['city']),
    district: pick(row, ['district']),
    state: pick(row, ['state']),
    postcode: pick(row, ['postcode', 'pin', 'pincode']),
  }
}

export function addressFromCheckoutParse(
  raw: unknown,
  whatsappNumber: string
): { ok: true; address: PendingCheckoutAddress } | { ok: false; missing: string[]; draft: PendingCheckoutAddress } {
  const candidate = addressDraftFromRaw(raw, whatsappNumber)
  const missing = missingAddressFields(candidate)
  if (missing.length === 0) {
    const parsed = storefrontShippingAddressSchema.safeParse(candidate)
    if (parsed.success) return { ok: true, address: parsed.data }
  }
  return { ok: false, missing, draft: candidate }
}

/**
 * Build the next address draft from this message + any saved draft.
 * Comma lists and one-field replies do not need the LLM.
 */
export function nextAddressDraft(input: {
  text: string
  previous: PendingCheckoutAddress | null
  phone: string
  previousMissing?: string[]
  llmRaw?: unknown
}): { ok: true; address: PendingCheckoutAddress } | { ok: false; missing: string[]; draft: PendingCheckoutAddress } {
  const phone = input.phone.trim()
  const previous = input.previous ?? emptyAddressDraft(phone)

  if (isAddressAlreadySaid(input.text)) {
    const missing = missingAddressFields({ ...previous, phone_number: previous.phone_number || phone })
    if (missing.length === 0) {
      const parsed = storefrontShippingAddressSchema.safeParse({
        ...previous,
        phone_number: previous.phone_number || phone,
      })
      if (parsed.success) return { ok: true, address: parsed.data }
    }
    return { ok: false, missing, draft: previous }
  }

  const single = fillSingleMissingField(previous, input.text, input.previousMissing ?? [])
  if (single) {
    const draft = mergeAddressDraft(previous, single, phone)
    const missing = missingAddressFields(draft)
    if (missing.length === 0) {
      const parsed = storefrontShippingAddressSchema.safeParse(draft)
      if (parsed.success) return { ok: true, address: parsed.data }
    }
    return { ok: false, missing, draft }
  }

  const fromComma = parseCommaAddress(input.text)
  const fromLlm = input.llmRaw !== undefined ? addressDraftFromRaw(input.llmRaw, phone) : null
  const draft = mergeAddressDraft(previous, fromComma ?? fromLlm ?? emptyAddressDraft(phone), phone)
  const missing = missingAddressFields(draft)
  if (missing.length === 0) {
    const parsed = storefrontShippingAddressSchema.safeParse(draft)
    if (parsed.success) return { ok: true, address: parsed.data }
  }
  return { ok: false, missing, draft }
}
