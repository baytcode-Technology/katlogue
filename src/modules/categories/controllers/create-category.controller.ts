import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as createCategoryService from '../services/create-category.service.js'
import type { CreateCategoryBody } from '../validations/category.validation.js'

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const body = req.body as CreateCategoryBody
  const category = await createCategoryService.createCategory(req.authUser.id, body)

  res.status(201).json({
    success: true,
    message: 'Category created successfully',
    data: category,
  })
})
