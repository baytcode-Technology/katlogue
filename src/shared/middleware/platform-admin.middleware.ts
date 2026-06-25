import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app.error.js';
import { isPlatformAdmin } from '../lib/platform-admin.js';

export function requirePlatformAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.authUser) {
    return next(new AppError(401, 'Unauthorized', 'UNAUTHORIZED'));
  }

  if (!isPlatformAdmin(req.authUser.id)) {
    return next(new AppError(403, 'Platform admin access required', 'FORBIDDEN'));
  }

  next();
}
