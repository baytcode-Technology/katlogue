function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

/** Blank variant price follows the product. A stored number, including 0, is the selling price. */
export function variantSellingPrice(
  basePrice: number,
  variant: { price?: number | null } | null | undefined,
): number {
  if (variant?.price === null || variant?.price === undefined) return Number(basePrice)
  return Number(variant.price)
}

/**
 * `price` wins when the client sends it (new app and web).
 * `price_delta` is the installed app: 0 follows the product, anything else is added to the base.
 * Returns null when the request did not mention a price.
 */
export function resolveVariantPriceFields(
  basePrice: number,
  input: { price?: number | null; price_delta?: number },
): { price: number | null; price_delta: number } | null {
  const base = Number(basePrice)
  if (input.price !== undefined) {
    if (input.price === null) return { price: null, price_delta: 0 }
    const price = roundMoney(Math.max(0, Number(input.price)))
    return { price, price_delta: roundMoney(price - base) }
  }
  if (input.price_delta !== undefined) {
    const delta = Number(input.price_delta)
    if (!Number.isFinite(delta) || delta === 0) return { price: null, price_delta: 0 }
    return {
      price: roundMoney(Math.max(0, base + delta)),
      price_delta: roundMoney(delta),
    }
  }
  return null
}

export function resolveVariantPriceForSave(
  basePrice: number,
  input: { price?: number | null; price_delta?: number },
): { price: number | null; price_delta: number } {
  return resolveVariantPriceFields(basePrice, input) ?? { price: null, price_delta: 0 }
}
