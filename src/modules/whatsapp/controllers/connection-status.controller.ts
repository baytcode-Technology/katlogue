import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { getConnectionStatus } from '../services/onboard-coexistence.service.js'

export const connectionStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

  const storeId = String(req.query.store_id ?? req.query.storeId ?? '').trim()
  if (!storeId) throw new AppError(400, 'store_id is required', 'VALIDATION_ERROR')

  await storeRepository.assertStoreOwner(storeId, req.authUser.id)
  const status = await getConnectionStatus(storeId)

  res.status(200).json({
    success: true,
    message: 'Connection status fetched',
    data: status,
  })
})
