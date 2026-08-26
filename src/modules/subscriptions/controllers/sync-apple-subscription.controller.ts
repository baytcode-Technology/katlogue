import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as syncAppleSubscriptionService from '../services/sync-apple-subscription.service.js'

export const syncAppleSubscription = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

  const storeId = Number(req.query.store_id)
  const result = await syncAppleSubscriptionService.syncAppleSubscriptionFromRevenueCat({
    ownerId: req.authUser.id,
    storeId,
  })

  res.status(200).json({
    success: true,
    message: result.active ? 'Subscription synced' : 'No active Apple subscription',
    data: {
      store: {
        subscription_plan: result.subscription_plan,
        subscription_expires_at: result.subscription_expires_at,
      },
      subscription_plan: result.subscription_plan,
      subscription_expires_at: result.subscription_expires_at,
      active: result.active,
    },
  })
})
