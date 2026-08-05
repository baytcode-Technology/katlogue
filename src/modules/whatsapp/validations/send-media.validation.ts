import { z } from 'zod'
import { entityId, optionalEntityId } from '../../../shared/validations/zod-helpers.js'

export const sendMediaSchema = z
  .object({
    storeId: optionalEntityId('Invalid store id'),
    store_id: optionalEntityId('Invalid store id'),
    conversationId: optionalEntityId('Invalid conversation id'),
    conversation_id: optionalEntityId('Invalid conversation id'),
    to: z.string().min(8).max(20),
    type: z.enum(['image', 'audio', 'video']),
    mediaId: z.string().min(1).max(256),
    mimeType: z.string().max(128).optional().nullable(),
    caption: z.string().max(1024).optional().nullable(),
    voice: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.storeId || v.store_id), {
    message: 'storeId is required',
    path: ['storeId'],
  })

export type SendMediaBody = z.infer<typeof sendMediaSchema>

export const forwardMessageSchema = z
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

export type ForwardMessageBody = z.infer<typeof forwardMessageSchema>
