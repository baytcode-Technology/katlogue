import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as pushTokenService from '../services/push-token.service.js'
import type { RequiredStoreQuery } from '../../stores/validations/store.validation.js'
import type { UpsertPushTokenBody } from '../validations/notification.validation.js'

export const upsertPushToken = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const { store_id } = req.validatedQuery as RequiredStoreQuery
  const body = req.body as UpsertPushTokenBody
  const data = await pushTokenService.registerPushTokenForStoreMember(
    req.authUser.id,
    store_id,
    body
  )

  res.status(200).json({
    success: true,
    message: 'Push token registered',
    data,
  })
})
