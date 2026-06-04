import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as deleteCategoryService from '../services/delete-category.service.js'
import type { CategoryIdParam } from '../validations/sync-category-products.validation.js'

export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const { categoryId } = req.params as unknown as CategoryIdParam
  await deleteCategoryService.deleteCategory(req.authUser.id, categoryId)

  res.status(200).json({
    success: true,
    message: 'Category deleted. Products were removed from this category.',
  })
})
