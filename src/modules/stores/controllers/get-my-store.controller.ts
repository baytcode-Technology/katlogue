import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as getMyStoreService from '../services/get-my-store.service.js'
import type { MyStoreQuery } from '../validations/store.validation.js'

export const getMyStore = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const { store_id } = (req.validatedQuery ?? {}) as MyStoreQuery
  const result = await getMyStoreService.getMyStore(req.authUser.id, store_id)

  res.status(200).json({
    success: true,
    message: result.hasStore ? 'Store found' : 'No store found',
    data: result,
  })
})
