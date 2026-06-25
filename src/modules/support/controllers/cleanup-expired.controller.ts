import type { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/helpers/async-handler.js';
import * as cleanupExpiredService from '../services/cleanup-expired.service.js';

export const cleanupExpired = asyncHandler(async (_req: Request, res: Response) => {
  const result = await cleanupExpiredService.cleanupExpiredConversations();

  res.json({
    success: true,
    message: 'Expired support conversations cleaned up',
    data: result,
  });
});
