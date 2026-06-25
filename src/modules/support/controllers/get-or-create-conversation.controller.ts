import type { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/helpers/async-handler.js';
import { AppError } from '../../../shared/errors/app.error.js';
import { isPlatformAdmin } from '../../../shared/lib/platform-admin.js';
import * as getOrCreateConversationService from '../services/get-or-create-conversation.service.js';
import type { SupportStoreQuery } from '../validations/support.validation.js';

export const getOrCreateConversation = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED');

  const { store_id } = req.query as unknown as SupportStoreQuery;
  const conversation = await getOrCreateConversationService.getOrCreateConversation(
    req.authUser.id,
    store_id
  );

  res.json({
    success: true,
    message: 'Support conversation ready',
    data: { conversation },
  });
});

export const checkPlatformAdmin = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED');

  res.json({
    success: true,
    message: 'Admin status',
    data: { isAdmin: isPlatformAdmin(req.authUser.id) },
  });
});
