import type { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/helpers/async-handler.js';
import { AppError } from '../../../shared/errors/app.error.js';
import * as closeConversationService from '../services/close-conversation.service.js';
import type {
  SupportConversationParams,
  SupportStoreQuery,
} from '../validations/support.validation.js';

export const closeMerchantConversation = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED');

  const { store_id } = req.validatedQuery as SupportStoreQuery;
  const { id } = req.params as unknown as SupportConversationParams;

  const result = await closeConversationService.closeMerchantConversation(
    req.authUser.id,
    store_id,
    id
  );

  res.json({
    success: true,
    message: 'Ticket closed',
    data: result,
  });
});
