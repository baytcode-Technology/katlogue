import type { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/helpers/async-handler.js';
import { AppError } from '../../../shared/errors/app.error.js';
import * as getMerchantUnreadService from '../services/get-merchant-unread.service.js';
import type { SupportStoreQuery } from '../validations/support.validation.js';

export const getMerchantUnread = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED');

  const { store_id } = req.validatedQuery as SupportStoreQuery;
  const summary = await getMerchantUnreadService.getMerchantUnread(
    req.authUser.id,
    store_id
  );

  res.json({
    success: true,
    message: 'Support unread fetched',
    data: summary,
  });
});
