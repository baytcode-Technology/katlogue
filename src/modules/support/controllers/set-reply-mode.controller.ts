import type { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/helpers/async-handler.js';
import * as setReplyModeService from '../services/set-reply-mode.service.js';
import type { SupportConversationParams } from '../validations/support.validation.js';
import { setReplyModeSchema } from '../validations/support.validation.js';

export const setReplyMode = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as SupportConversationParams;
  const { reply_mode } = setReplyModeSchema.parse(req.body);

  const result = await setReplyModeService.setReplyMode(id, reply_mode);

  res.json({
    success: true,
    message: 'Reply mode updated',
    data: result,
  });
});
