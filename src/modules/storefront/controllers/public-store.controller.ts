import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { env } from '../../../config/env.js'
import { buildSubdomainUrl } from '../../../shared/utils/storefront.js'

export const getPublicStore = asyncHandler(async (req: Request, res: Response) => {
  if (!req.store) {
    throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  }

  res.status(200).json({
    success: true,
    data: {
      store: req.store,
      subdomainUrl: buildSubdomainUrl(req.store.slug, env.STOREFRONT_BASE_DOMAIN),
    },
  })
})
