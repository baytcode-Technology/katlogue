import type { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/helpers/async-handler.js';
import * as closeConversationService from '../services/close-conversation.service.js';
import type { SupportConversationParams } from '../validations/support.validation.js';

export const closeConversation = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as SupportConversationParams;

  const result = await closeConversationService.closeConversation(id);

  res.json({
    success: true,
    message: 'Ticket closed',
    data: result,
  });
});
