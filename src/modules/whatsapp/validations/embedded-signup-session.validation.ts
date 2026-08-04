import { z } from 'zod'

export const embeddedSignupSessionSchema = z
  .object({
    state: z.string().trim().min(1, 'state is required'),
    wabaId: z.string().trim().min(1).optional(),
    waba_id: z.string().trim().min(1).optional(),
    phoneNumberId: z.string().trim().min(1).optional(),
    phone_number_id: z.string().trim().min(1).optional(),
  })
  .refine((v) => Boolean(v.wabaId || v.waba_id), {
    message: 'wabaId is required',
    path: ['wabaId'],
  })
  .transform((v) => ({
    state: v.state,
    wabaId: (v.wabaId ?? v.waba_id)!,
    phoneNumberId: v.phoneNumberId ?? v.phone_number_id ?? null,
  }))
