import type { NextFunction, Request, Response } from 'express'
import type { ZodType } from 'zod'
import { AppError } from '../errors/app.error.js'

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    // #region agent log
    if (req.path.includes('/products') && req.method === 'POST') {
      fetch('http://127.0.0.1:7642/ingest/403551e5-c17d-483b-8ef5-ce6768f0a7b2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f8490e' },
        body: JSON.stringify({
          sessionId: 'f8490e',
          location: 'validate.middleware.ts:validateBody',
          message: 'create product body before zod',
          data: {
            store_id: (req.body as { store_id?: unknown })?.store_id,
            store_id_type: typeof (req.body as { store_id?: unknown })?.store_id,
          },
          timestamp: Date.now(),
          hypothesisId: 'H3-create-store-id',
        }),
      }).catch(() => {})
    }
    // #endregion

    const result = schema.safeParse(req.body)
    if (!result.success) {
      // #region agent log
      if (req.path.includes('/products') && req.method === 'POST') {
        fetch('http://127.0.0.1:7642/ingest/403551e5-c17d-483b-8ef5-ce6768f0a7b2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f8490e' },
          body: JSON.stringify({
            sessionId: 'f8490e',
            location: 'validate.middleware.ts:validateBody:fail',
            message: 'create product validation failed',
            data: { issues: result.error.issues.map((i) => ({ path: i.path, message: i.message })) },
            timestamp: Date.now(),
            hypothesisId: 'H3-create-store-id',
          }),
        }).catch(() => {})
      }
      // #endregion
      const message = result.error.issues.map((i) => i.message).join(', ')
      return next(new AppError(400, message, 'VALIDATION_ERROR'))
    }
    req.body = result.data
    next()
  }
}

export function validateQuery<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    // #region agent log
    if (req.path.includes('/products') && req.method === 'GET') {
      fetch('http://127.0.0.1:7642/ingest/403551e5-c17d-483b-8ef5-ce6768f0a7b2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f8490e' },
        body: JSON.stringify({
          sessionId: 'f8490e',
          location: 'validate.middleware.ts:validateQuery',
          message: 'products list query before zod',
          data: { store_id: req.query.store_id, store_id_type: typeof req.query.store_id },
          timestamp: Date.now(),
          hypothesisId: 'H2-nan-from-query',
        }),
      }).catch(() => {})
    }
    // #endregion

    const result = schema.safeParse(req.query)
    if (!result.success) {
      // #region agent log
      if (req.path.includes('/products') && req.method === 'GET') {
        fetch('http://127.0.0.1:7642/ingest/403551e5-c17d-483b-8ef5-ce6768f0a7b2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f8490e' },
          body: JSON.stringify({
            sessionId: 'f8490e',
            location: 'validate.middleware.ts:validateQuery:fail',
            message: 'products list validation failed',
            data: {
              store_id: req.query.store_id,
              issues: result.error.issues.map((i) => ({ path: i.path, message: i.message })),
            },
            timestamp: Date.now(),
            hypothesisId: 'H2-nan-from-query',
          }),
        }).catch(() => {})
      }
      // #endregion
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
