import { z } from 'zod'
import { optionalEntityId } from '../../../shared/validations/zod-helpers.js'

export const offboardWhatsAppSchema = z
  .object({
    storeId: optionalEntityId('Invalid store id'),
    store_id: optionalEntityId('Invalid store id'),
    wabaId: z.string().trim().min(1).optional(),
    waba_id: z.string().trim().min(1).optional(),
    phoneNumberId: z.string().trim().min(1).optional(),
    phone_number_id: z.string().trim().min(1).optional(),
  })
  .refine((v) => Boolean(v.storeId || v.store_id), {
    message: 'storeId is required',
    path: ['storeId'],
  })
