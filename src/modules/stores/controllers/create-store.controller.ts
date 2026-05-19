import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { env } from '../../../config/env.js'
import { buildSubdomainUrl } from '../../../shared/utils/storefront.js'
import * as createStoreService from '../services/create-store.service.js'
import type { CreateStoreBody } from '../validations/store.validation.js'

export const createStore = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const body = req.body as CreateStoreBody
  const store = await createStoreService.createStore(req.authUser.id, body)

  res.status(201).json({
    success: true,
    message: 'Store created successfully',
    data: {
      store,
      subdomainUrl: buildSubdomainUrl(store.slug, env.STOREFRONT_BASE_DOMAIN),
    },
  })
})
