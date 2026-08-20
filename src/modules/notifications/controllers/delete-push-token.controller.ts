import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as pushTokenService from '../services/push-token.service.js'
import type { RequiredStoreQuery } from '../../stores/validations/store.validation.js'
import type { DeletePushTokenBody } from '../validations/notification.validation.js'

export const deletePushToken = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const { store_id } = req.validatedQuery as RequiredStoreQuery
  const body = req.body as DeletePushTokenBody
  const data = await pushTokenService.unregisterPushTokenForOwner(
    req.authUser.id,
    store_id,
    body.expo_push_token
  )

  res.status(200).json({
    success: true,
    message: data.removed ? 'Push token removed' : 'Push token not found',
    data,
  })
})
