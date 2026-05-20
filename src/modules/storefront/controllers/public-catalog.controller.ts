import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as getCatalogService from '../services/get-catalog.service.js'
import type { CatalogQueryInput } from '../validations/catalog.validation.js'

export const getCatalog = asyncHandler(async (req: Request, res: Response) => {
  if (!req.store) {
    throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  }

  const query = req.validatedQuery as CatalogQueryInput
  const catalog = await getCatalogService.getCatalog(req.store.id, query)

  res.status(200).json({
    success: true,
    message: 'Catalog fetched successfully',
    data: catalog,
  })
})
