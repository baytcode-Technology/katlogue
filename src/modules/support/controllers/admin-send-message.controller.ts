import type { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/helpers/async-handler.js';
import * as adminSendMessageService from '../services/admin-send-message.service.js';
import type {
  SupportConversationParams,
} from '../validations/support.validation.js';
import { adminSendMessageSchema } from '../validations/support.validation.js';

export const adminSendMessage = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as SupportConversationParams;
  const { content } = adminSendMessageSchema.parse(req.body);

  const result = await adminSendMessageService.adminSendMessage(id, content);

  res.json({
    success: true,
    message: 'Reply sent',
    data: result,
  });
});
