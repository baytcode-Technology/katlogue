import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as updateProductService from '../services/update-product.service.js'
import type { ProductIdParam, UpdateProductBody } from '../validations/product.validation.js'

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const { productId } = req.params as unknown as ProductIdParam
  const body = req.body as UpdateProductBody
  const product = await updateProductService.updateProduct(
    req.authUser.id,
    productId,
    body
  )

  res.status(200).json({
    success: true,
    message: 'Product updated successfully',
    data: product,
  })
})
