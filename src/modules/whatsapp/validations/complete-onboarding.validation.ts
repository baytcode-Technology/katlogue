import { z } from 'zod'
import { optionalEntityId } from '../../../shared/validations/zod-helpers.js'

export const completeOnboardingSchema = z
  .object({
    storeId: optionalEntityId('Invalid store id'),
    store_id: optionalEntityId('Invalid store id'),
    code: z.string().trim().min(1, 'code is required'),
    state: z.string().trim().min(1).optional(),
    wabaId: z.string().trim().min(1).optional(),
    waba_id: z.string().trim().min(1).optional(),
    phoneNumberId: z.string().trim().min(1).optional(),
    phone_number_id: z.string().trim().min(1).optional(),
  })
  .refine((v) => Boolean(v.storeId || v.store_id), {
    message: 'storeId is required',
    path: ['storeId'],
  })
  .refine((v) => Boolean(v.wabaId || v.waba_id || v.state), {
    message: 'wabaId or state is required',
    path: ['wabaId'],
  })
  .transform((v) => ({
    storeId: (v.storeId ?? v.store_id)!,
    code: v.code,
    state: v.state ?? null,
    wabaId: v.wabaId ?? v.waba_id ?? null,
    phoneNumberId: v.phoneNumberId ?? v.phone_number_id ?? null,
  }))

export type CompleteOnboardingBody = z.infer<typeof completeOnboardingSchema>
