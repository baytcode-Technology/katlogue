import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { findActiveCategoriesByStoreId } from '../../categories/repositories/category.repository.js'

export const getPublicCategories = asyncHandler(async (req: Request, res: Response) => {
  if (!req.store) {
    throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  }

  const categories = await findActiveCategoriesByStoreId(req.store.id)

  res.status(200).json({
    success: true,
    data: {
      categories,
      count: categories.length,
    },
  })
})
