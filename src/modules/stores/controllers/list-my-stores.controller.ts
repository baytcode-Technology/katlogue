import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as listMyStoresService from '../services/list-my-stores.service.js'

export const listMyStores = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const stores = await listMyStoresService.listMyStores(req.authUser.id)

  res.status(200).json({
    success: true,
    message: 'Stores loaded',
    data: { stores, count: stores.length },
  })
})
