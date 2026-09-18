import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as webPushSubscriptionService from '../services/web-push-subscription.service.js'
import type { RequiredStoreQuery } from '../../stores/validations/store.validation.js'
import type { DeleteWebPushSubscriptionBody } from '../validations/notification.validation.js'

export const deleteWebPushSubscription = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const { store_id } = req.validatedQuery as RequiredStoreQuery
  const body = req.body as DeleteWebPushSubscriptionBody
  const data = await webPushSubscriptionService.unregisterWebPushSubscriptionForStoreMember(
    req.authUser.id,
    store_id,
    body.endpoint
  )

  res.status(200).json({
    success: true,
    message: data.removed ? 'Web push subscription removed' : 'Web push subscription not found',
    data,
  })
})
