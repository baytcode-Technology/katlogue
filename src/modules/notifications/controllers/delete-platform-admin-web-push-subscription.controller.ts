import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as platformAdminWebPushService from '../services/platform-admin-web-push-subscription.service.js'
import type { DeleteWebPushSubscriptionBody } from '../validations/notification.validation.js'

export const deletePlatformAdminWebPushSubscription = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.authUser) {
      throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
    }

    const body = req.body as DeleteWebPushSubscriptionBody
    const data = await platformAdminWebPushService.unregisterPlatformAdminWebPushSubscription(
      req.authUser.id,
      body.endpoint
    )

    res.status(200).json({
      success: true,
      message: 'Admin web push subscription removed',
      data,
    })
  }
)
