import type { NextFunction, Request, Response } from 'express'
import type { ZodType } from 'zod'
import { AppError } from '../errors/app.error.js'

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      const message = result.error.issues.map((i) => i.message).join(', ')
      return next(new AppError(400, message, 'VALIDATION_ERROR'))
    }
    req.body = result.data
    next()
  }
}

export function validateQuery<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query)
    if (!result.success) {
      const message = result.error.issues.map((i) => i.message).join(', ')
      return next(new AppError(400, message, 'VALIDATION_ERROR'))
    }
    // Express 5: req.query is read-only — assign fields instead of replacing the object
    const query = req.query as Record<string, unknown>
    const parsed = result.data as Record<string, unknown>
    for (const key of Object.keys(query)) {
      if (!(key in parsed)) {
        delete query[key]
      }
    }
    Object.assign(query, parsed)
    next()
  }
}

export function validateParams<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params)
    if (!result.success) {
      const message = result.error.issues.map((i) => i.message).join(', ')
      return next(new AppError(400, message, 'VALIDATION_ERROR'))
    }
    Object.assign(req.params, result.data)
    next()
  }
}
