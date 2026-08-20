import { z } from 'zod'
import { entityId, optionalEntityId } from '../../../shared/validations/zod-helpers.js'

export const sendInstagramMediaSchema = z
  .object({
    storeId: optionalEntityId('Invalid store id'),
    store_id: optionalEntityId('Invalid store id'),
    conversationId: optionalEntityId('Invalid conversation id'),
    conversation_id: optionalEntityId('Invalid conversation id'),
    to: z.string().min(1).max(64),
    type: z.enum(['image', 'audio', 'video']),
    mediaUrl: z.string().url().max(2048),
    mimeType: z.string().max(128).optional().nullable(),
    caption: z.string().max(1000).optional().nullable(),
  })
  .refine((v) => Boolean(v.storeId || v.store_id), {
    message: 'storeId is required',
    path: ['storeId'],
  })

export type SendInstagramMediaBody = z.infer<typeof sendInstagramMediaSchema>

export const forwardInstagramMessageSchema = z
  .object({
    storeId: optionalEntityId('Invalid store id'),
    store_id: optionalEntityId('Invalid store id'),
    sourceMessageId: optionalEntityId('Invalid source message id'),
    source_message_id: optionalEntityId('Invalid source message id'),
    targetConversationId: optionalEntityId('Invalid target conversation id'),
    target_conversation_id: optionalEntityId('Invalid target conversation id'),
  })
  .refine((v) => Boolean(v.storeId || v.store_id), {
    message: 'storeId is required',
    path: ['storeId'],
  })
  .refine((v) => Boolean(v.sourceMessageId || v.source_message_id), {
    message: 'sourceMessageId is required',
    path: ['sourceMessageId'],
  })
  .refine((v) => Boolean(v.targetConversationId || v.target_conversation_id), {
    message: 'targetConversationId is required',
    path: ['targetConversationId'],
  })

export type ForwardInstagramMessageBody = z.infer<typeof forwardInstagramMessageSchema>
