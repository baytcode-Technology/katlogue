import { z } from 'zod'
import { parseEntityId } from '../lib/parse-entity-id.js'

/** Treat `""` and `null` as missing for optional API fields. */
export function emptyToUndefined(value: unknown): unknown {
  if (value === '' || value === null) return undefined
  return value
}

export function entityId(message: string) {
  return z
    .union([z.number(), z.string()])
    .superRefine((val, ctx) => {
      try {
        parseEntityId(val, message)
      } catch (e) {
        ctx.addIssue({
          code: 'custom',
          message: e instanceof Error ? e.message : message,
        })
      }
    })
    .transform((val) => parseEntityId(val, message))
}

export function optionalEntityId(message: string) {
  return z.preprocess(emptyToUndefined, entityId(message).optional())
}

/** Auth user IDs (Supabase auth.users) remain UUIDs. */
export function authUserId(message = 'Invalid user id') {
  return z.uuid(message)
}

export function optionalAuthUserId(message = 'Invalid user id') {
  return z.preprocess(emptyToUndefined, z.uuid(message).optional())
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
  product_id: entityId('Invalid product id'),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
  variant_id: optionalEntityId('Invalid variant id'),
})
