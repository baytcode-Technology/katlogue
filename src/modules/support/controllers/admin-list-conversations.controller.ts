import type { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/helpers/async-handler.js';
import * as adminListConversationsService from '../services/admin-list-conversations.service.js';

export const listAdminConversations = asyncHandler(async (_req: Request, res: Response) => {
  const conversations = await adminListConversationsService.listAdminConversations();

  res.json({
    success: true,
    message: 'Support conversations fetched',
    data: { conversations, count: conversations.length },
  });
});
