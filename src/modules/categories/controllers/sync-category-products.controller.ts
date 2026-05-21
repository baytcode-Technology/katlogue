import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as syncService from '../services/sync-category-products.service.js'
import type {
  CategoryIdParam,
  SyncCategoryProductsBody,
} from '../validations/sync-category-products.validation.js'

export const syncCategoryProducts = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const { categoryId } = req.params as unknown as CategoryIdParam
  const body = req.body as SyncCategoryProductsBody
  const result = await syncService.syncCategoryProducts(
    req.authUser.id,
    categoryId,
    body.store_id,
    body.product_ids
  )

  res.status(200).json({
    success: true,
    message: 'Category products updated',
    data: result,
  })
})
