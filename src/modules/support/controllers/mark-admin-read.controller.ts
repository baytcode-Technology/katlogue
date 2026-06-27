import type { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/helpers/async-handler.js';
import * as markAdminReadService from '../services/mark-admin-read.service.js';
import type { SupportConversationParams } from '../validations/support.validation.js';

export const markAdminRead = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as SupportConversationParams;

  const result = await markAdminReadService.markAdminRead(id);

  res.json({
    success: true,
    message: 'Support thread marked as read',
    data: result,
  });
});
