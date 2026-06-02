import { z } from 'zod'

export const triggerSyncSchema = z
  .object({
    storeId: z.string().uuid().optional(),
    store_id: z.string().uuid().optional(),
  })
  .refine((v) => Boolean(v.storeId || v.store_id), {
    message: 'storeId is required',
    path: ['storeId'],
  })

export type TriggerSyncBody = z.infer<typeof triggerSyncSchema>
