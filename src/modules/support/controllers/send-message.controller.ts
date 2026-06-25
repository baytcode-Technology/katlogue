import type { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/helpers/async-handler.js';
import { AppError } from '../../../shared/errors/app.error.js';
import * as sendMessageService from '../services/send-message.service.js';
import type {
  SendSupportMessageBody,
  SupportConversationParams,
  SupportStoreQuery,
} from '../validations/support.validation.js';

export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED');

  const { store_id } = req.validatedQuery as SupportStoreQuery;
  const { id } = req.params as unknown as SupportConversationParams;
  const { content } = req.body as SendSupportMessageBody;

  const result = await sendMessageService.sendMessage(
    req.authUser.id,
    store_id,
    id,
    content
  );

  res.json({
    success: true,
    message: 'Message sent',
    data: result,
  });
});
