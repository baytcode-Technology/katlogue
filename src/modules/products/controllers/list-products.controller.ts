import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as listProductsService from '../services/list-products.service.js'
import type { ListProductsQuery } from '../validations/list-products.validation.js'

export const listProducts = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const { store_id } = req.validatedQuery as ListProductsQuery
  const products = await listProductsService.listProductsByStore(
    req.authUser.id,
    store_id
  )

  res.status(200).json({
    success: true,
    message: 'Products fetched successfully',
    data: {
      store_id,
      products,
      count: products.length,
    },
  })
})
