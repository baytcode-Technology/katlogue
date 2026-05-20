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
    // Express 5: req.query is read-only / frozen — never assign or mutate it
    req.validatedQuery = result.data
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
