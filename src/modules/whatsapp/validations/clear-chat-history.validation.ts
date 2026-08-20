import { z } from 'zod'
import { optionalEntityId } from '../../../shared/validations/zod-helpers.js'

export const clearWhatsAppChatHistorySchema = z
  .object({
    storeId: optionalEntityId('Invalid store id'),
    store_id: optionalEntityId('Invalid store id'),
  })
  .refine((v) => Boolean(v.storeId || v.store_id), {
    message: 'storeId is required',
    path: ['storeId'],
  })
