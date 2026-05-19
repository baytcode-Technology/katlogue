import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { findActiveProductsByStoreId } from '../../products/repositories/product.repository.js'

export const getPublicProducts = asyncHandler(async (req: Request, res: Response) => {
  if (!req.store) {
    throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  }

  const products = await findActiveProductsByStoreId(req.store.id)

  res.status(200).json({
    success: true,
    data: {
      products,
      count: products.length,
    },
  })
})
