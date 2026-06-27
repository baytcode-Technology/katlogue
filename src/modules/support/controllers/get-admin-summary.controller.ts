import type { Request, Response } from 'express';
import { asyncHandler } from '../../../shared/helpers/async-handler.js';
import * as getAdminSummaryService from '../services/get-admin-summary.service.js';

export const getAdminSummary = asyncHandler(async (_req: Request, res: Response) => {
  const summary = await getAdminSummaryService.getAdminSummary();

  res.json({
    success: true,
    message: 'Support admin summary fetched',
    data: summary,
  });
});
