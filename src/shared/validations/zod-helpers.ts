import { z } from 'zod'

/** Treat `""` and `null` as missing for optional API fields. */
export function emptyToUndefined(value: unknown): unknown {
  if (value === '' || value === null) return undefined
  return value
}

export function optionalUuid(message: string) {
  return z.preprocess(emptyToUndefined, z.uuid(message).optional())
}

export function optionalEmail() {
  return z.preprocess(emptyToUndefined, z.email('Invalid email').optional())
}

export function optionalTrimmedString(max: number) {
  return z.preprocess(emptyToUndefined, z.string().trim().max(max).optional())
}

export const orderItemSchema = z.object({
  product_id: z.uuid('Invalid product id'),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
  variant_id: z.preprocess(
    emptyToUndefined,
    z.uuid('Invalid variant id').optional()
  ),
})
