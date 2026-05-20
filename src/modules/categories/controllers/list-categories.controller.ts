import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as listCategoriesService from '../services/list-categories.service.js'
import type { ListCategoriesQuery } from '../validations/category.validation.js'

export const listCategories = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const { store_id } = req.validatedQuery as ListCategoriesQuery
  const categories = await listCategoriesService.listCategoriesByStore(
    req.authUser.id,
    store_id
  )

  res.status(200).json({
    success: true,
    message: 'Categories fetched successfully',
    data: {
      store_id,
      categories,
      count: categories.length,
    },
  })
})
