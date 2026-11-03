export type ShopPolicies = {
  has_physical_store: boolean
  address: string | null
  hours: string | null
  default_delivery_business_days: number | null
  delivery_fee: number | null
  free_delivery_above: number | null
  same_day_delivery: boolean
  next_day_delivery: boolean
  service_area: string | null
  return_days: number | null
  exchange_allowed: boolean
  refund_days_after_cancel: number | null
  return_note: string | null
  current_offer_note: string | null
  pickup_note: string | null
}

export const EMPTY_SHOP_POLICIES: ShopPolicies = {
  has_physical_store: false,
  address: null,
  hours: null,
  default_delivery_business_days: null,
  delivery_fee: null,
  free_delivery_above: null,
  same_day_delivery: false,
  next_day_delivery: false,
  service_area: null,
  return_days: null,
  exchange_allowed: false,
  refund_days_after_cancel: null,
  return_note: null,
  current_offer_note: null,
  pickup_note: null,
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return null
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function parseShopPolicies(raw: unknown): ShopPolicies {
  const record =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {}

  const days = asNumber(record.default_delivery_business_days)
  const fee = asNumber(record.delivery_fee)
  const freeAbove = asNumber(record.free_delivery_above)
  const returnDays = asNumber(record.return_days)
  const refundDays = asNumber(record.refund_days_after_cancel)

  return {
    has_physical_store: record.has_physical_store === true,
    address: asString(record.address),
    hours: asString(record.hours),
    default_delivery_business_days:
      days != null && days >= 1 && days <= 90 ? Math.round(days) : null,
    delivery_fee: fee != null && fee >= 0 ? fee : null,
    free_delivery_above: freeAbove != null && freeAbove >= 0 ? freeAbove : null,
    same_day_delivery: record.same_day_delivery === true,
    next_day_delivery: record.next_day_delivery === true,
    service_area: asString(record.service_area),
    return_days: returnDays != null && returnDays >= 0 ? Math.round(returnDays) : null,
    exchange_allowed: record.exchange_allowed === true,
    refund_days_after_cancel:
      refundDays != null && refundDays >= 0 ? Math.round(refundDays) : null,
    return_note: asString(record.return_note),
    current_offer_note: asString(record.current_offer_note),
    pickup_note: asString(record.pickup_note),
  }
}

export function addBusinessDays(from: Date, days: number): string {
  const count = Math.max(1, Math.round(days))
  const date = new Date(from)
  let added = 0
  while (added < count) {
    date.setUTCDate(date.getUTCDate() + 1)
    const weekday = date.getUTCDay()
    if (weekday !== 0 && weekday !== 6) added += 1
  }
  return date.toISOString().slice(0, 10)
}

export function resolvePromisedByDate(input: {
  orderedAt?: Date
  shopDefaultDays?: number | null
  productDays?: Array<number | null | undefined>
}): string | null {
  const productMax = input.productDays
    ?.filter((d): d is number => typeof d === 'number' && d >= 1)
    .reduce((max, d) => Math.max(max, d), 0)
  const days = productMax && productMax > 0 ? productMax : input.shopDefaultDays ?? null
  if (days == null || days < 1) return null
  return addBusinessDays(input.orderedAt ?? new Date(), days)
}

export function formatShopPolicyFacts(policies: ShopPolicies, currency: string): string {
  const lines: string[] = []
  lines.push(
    policies.has_physical_store
      ? `Physical store: yes${policies.address ? ` — ${policies.address}` : ''}`
      : 'Physical store: no (online shop)'
  )
  if (policies.hours) lines.push(`Shop hours: ${policies.hours}`)
  if (policies.service_area) lines.push(`Delivers to: ${policies.service_area}`)
  if (policies.default_delivery_business_days) {
    lines.push(
      `Usual delivery: ${policies.default_delivery_business_days} business day(s) after the order is placed`
    )
  } else {
    lines.push('Usual delivery days: not set — do not invent a number')
  }
  if (policies.delivery_fee != null) {
    lines.push(`Delivery charge: ${policies.delivery_fee} ${currency}`)
  } else {
    lines.push('Delivery charge: not set — do not invent a number')
  }
  if (policies.free_delivery_above != null) {
    lines.push(`Free delivery above: ${policies.free_delivery_above} ${currency}`)
  }
  lines.push(`Same-day delivery: ${policies.same_day_delivery ? 'yes' : 'no'}`)
  lines.push(`Next-day delivery: ${policies.next_day_delivery ? 'yes' : 'no'}`)
  if (policies.current_offer_note) {
    lines.push(`Current offer: ${policies.current_offer_note}`)
  } else {
    lines.push('Current offer: none listed — do not invent a discount')
  }
  if (policies.return_days != null) {
    lines.push(`Return window: ${policies.return_days} day(s)`)
  } else {
    lines.push('Return window: not set — staff will check')
  }
  lines.push(`Exchange: ${policies.exchange_allowed ? 'yes' : 'not listed'}`)
  if (policies.refund_days_after_cancel != null) {
    lines.push(`Refund after cancel: about ${policies.refund_days_after_cancel} day(s)`)
  }
  if (policies.return_note) lines.push(`Return note: ${policies.return_note}`)
  if (policies.pickup_note) lines.push(`Pickup: ${policies.pickup_note}`)
  return lines.join('\n')
}

/** Customer-facing copy. Omits internal "not set" instructions. */
export function formatShopPolicyCustomerCopy(policies: ShopPolicies, currency: string): string {
  const lines: string[] = []
  if (policies.has_physical_store) {
    lines.push(policies.address ? `Shop: ${policies.address}` : 'We have a physical shop.')
  }
  if (policies.hours) lines.push(`Hours: ${policies.hours}`)
  if (policies.service_area) lines.push(`We deliver to ${policies.service_area}.`)
  if (policies.default_delivery_business_days) {
    lines.push(`Usual delivery: ${policies.default_delivery_business_days} business day(s).`)
  }
  if (policies.delivery_fee != null) {
    lines.push(`Delivery charge: ${policies.delivery_fee} ${currency}.`)
  }
  if (policies.free_delivery_above != null) {
    lines.push(`Free delivery above ${policies.free_delivery_above} ${currency}.`)
  }
  if (policies.same_day_delivery) lines.push('Same-day delivery: yes.')
  if (policies.next_day_delivery) lines.push('Next-day delivery: yes.')
  if (policies.current_offer_note) lines.push(policies.current_offer_note)
  if (policies.return_days != null) lines.push(`Returns: ${policies.return_days} day(s).`)
  if (policies.exchange_allowed) lines.push('Exchange: yes.')
  if (policies.refund_days_after_cancel != null) {
    lines.push(`Refund after cancel: about ${policies.refund_days_after_cancel} day(s).`)
  }
  if (policies.return_note) lines.push(policies.return_note)
  if (policies.pickup_note) lines.push(policies.pickup_note)
  return lines.join('\n')
}
