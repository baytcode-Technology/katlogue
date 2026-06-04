import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as updateCategoryService from '../services/update-category.service.js'
import type { UpdateCategoryBody } from '../validations/category.validation.js'
import type { CategoryIdParam } from '../validations/sync-category-products.validation.js'

export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const { categoryId } = req.params as unknown as CategoryIdParam
  const body = req.body as UpdateCategoryBody
  const category = await updateCategoryService.updateCategory(
    req.authUser.id,
    categoryId,
    body
  )

  res.status(200).json({
    success: true,
    message: 'Category updated',
    data: category,
  })
})
