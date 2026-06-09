import type { NextFunction, Request, Response } from 'express'
import { env } from '../../config/env.js'
import { findActiveStoreBySlug } from '../../modules/stores/repositories/store.repository.js'
import { toPublicStore } from '../../modules/storefront/types/public-store.types.js'
import { AppError } from '../errors/app.error.js'
import { extractStoreSlugFromRequest } from '../utils/storefront.js'

export async function resolveStoreFromHost(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    const host =
      (req.headers['x-forwarded-host'] as string | undefined) ??
      req.headers.host ??
      req.hostname

    const slugHeader = req.headers['x-store-slug'] as string | undefined
    const slug = extractStoreSlugFromRequest(host, env.STOREFRONT_BASE_DOMAIN, slugHeader)

    if (!slug) {
      return next(
        new AppError(
          400,
          `Could not resolve store. Use a subdomain like my-shop.${env.STOREFRONT_BASE_DOMAIN}, or send the X-Store-Slug header (e.g. ghu).`,
          'STORE_NOT_RESOLVED'
        )
      )
    }

    const store = await findActiveStoreBySlug(slug)

    if (!store) {
      return next(new AppError(404, 'Store not found', 'STORE_NOT_FOUND'))
    }

    req.store = toPublicStore(store)
    next()
  } catch (err) {
    next(err)
  }
}
