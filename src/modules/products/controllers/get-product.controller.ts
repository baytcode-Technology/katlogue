import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as getProductService from '../services/get-product.service.js'
import type { ProductIdParam } from '../validations/product.validation.js'

export const getProduct = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const { productId } = req.params as ProductIdParam
  const data = await getProductService.getProductById(req.authUser.id, productId)

  res.status(200).json({
    success: true,
    message: 'Product fetched successfully',
    data,
  })
})
