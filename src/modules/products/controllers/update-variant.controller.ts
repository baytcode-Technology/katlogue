import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as variantService from '../services/variant.service.js'
import type { ProductVariantParams, UpdateProductVariantBody } from '../validations/product.validation.js'

export const updateVariant = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const { productId, variantId } = req.params as unknown as ProductVariantParams
  const body = req.body as UpdateProductVariantBody
  const variant = await variantService.updateVariant(
    req.authUser.id,
    productId,
    variantId,
    body
  )

  res.status(200).json({
    success: true,
    message: 'Variant updated successfully',
    data: { variant },
  })
})
