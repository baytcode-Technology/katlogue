import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as variantService from '../services/variant.service.js'
import { createProductVariantSchema } from '../validations/product.validation.js'
import type { ProductIdParam } from '../validations/product.validation.js'

export const createVariant = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const { productId } = req.params as unknown as ProductIdParam
  const parsed = createProductVariantSchema.safeParse(req.body)
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid request', 'VALIDATION_ERROR')
  }

  const variant = await variantService.createVariant(req.authUser.id, productId, parsed.data)

  res.status(201).json({
    success: true,
    message: 'Variant created successfully',
    data: { variant },
  })
})
