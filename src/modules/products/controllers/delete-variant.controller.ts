import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as variantService from '../services/variant.service.js'
import type { ProductVariantParams } from '../validations/product.validation.js'

export const deleteVariant = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const { productId, variantId } = req.params as unknown as ProductVariantParams
  await variantService.deleteVariant(req.authUser.id, productId, variantId)

  res.status(200).json({
    success: true,
    message: 'Variant deleted successfully',
    data: null,
  })
})
