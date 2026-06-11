import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as updateMyStoreService from '../services/update-my-store.service.js'
import type { UpdateStoreBody } from '../validations/store.validation.js'

export const updateMyStore = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const updated = await updateMyStoreService.updateMyStore(
    req.authUser.id,
    req.body as UpdateStoreBody
  )

  res.status(200).json({
    success: true,
    message: 'Store updated successfully',
    data: { store: updated },
  })
})
