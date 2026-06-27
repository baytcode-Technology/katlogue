import { z } from 'zod';
import { entityId } from '../../../shared/validations/zod-helpers.js';

export const supportStoreQuerySchema = z.object({
  store_id: entityId('Invalid store id'),
});

export const supportConversationParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const sendSupportMessageSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

export const adminSendMessageSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

export const setReplyModeSchema = z.object({
  reply_mode: z.enum(['ai', 'manual']),
});

export type SupportStoreQuery = z.infer<typeof supportStoreQuerySchema>;
export type SupportConversationParams = z.infer<typeof supportConversationParamsSchema>;
export type SendSupportMessageBody = z.infer<typeof sendSupportMessageSchema>;
