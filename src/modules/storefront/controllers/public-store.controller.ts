import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { env } from '../../../config/env.js'
import { buildStorefrontOrigin } from '../../../shared/utils/storefront.js'
import { toPublicStoreResponse } from '../types/public-store.types.js'

export const getPublicStore = asyncHandler(async (req: Request, res: Response) => {
  if (!req.store) {
    throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  }

  res.status(200).json({
    success: true,
    data: {
      store: toPublicStoreResponse(req.store),
      subdomainUrl: buildStorefrontOrigin({
        slug: req.store.slug,
        customDomain: req.store.custom_domain,
        customDomainStatus: req.store.custom_domain_status,
        baseDomain: env.STOREFRONT_BASE_DOMAIN,
      }),
    },
  })
})
