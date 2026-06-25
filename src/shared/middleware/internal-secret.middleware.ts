import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app.error.js';

export function requireInternalSecret(req: Request, _res: Response, next: NextFunction) {
  const secret = process.env.SUPPORT_CLEANUP_SECRET;
  if (!secret) {
    return next(new AppError(503, 'Cleanup not configured', 'NOT_CONFIGURED'));
  }

  const header = req.headers['x-support-cleanup-secret'];
  if (header !== secret) {
    return next(new AppError(401, 'Invalid cleanup secret', 'UNAUTHORIZED'));
  }

  next();
}
