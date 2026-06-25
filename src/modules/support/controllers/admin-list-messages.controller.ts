import type { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/helpers/async-handler.js';
import * as adminListMessagesService from '../services/admin-list-messages.service.js';
import type { SupportConversationParams } from '../validations/support.validation.js';

export const listAdminMessages = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as SupportConversationParams;
  const result = await adminListMessagesService.listAdminMessages(id);

  res.json({
    success: true,
    message: 'Messages fetched',
    data: result,
  });
});
