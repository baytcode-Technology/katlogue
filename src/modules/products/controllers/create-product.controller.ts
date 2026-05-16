import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as createProductService from '../services/create-product.service.js'
import type { CreateProductBody } from '../validations/product.validation.js'

export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const body = req.body as CreateProductBody
  const product = await createProductService.createProduct(req.authUser.id, body)

  res.status(201).json({
    success: true,
    message: 'Product created successfully',
    data: product,
  })
})
