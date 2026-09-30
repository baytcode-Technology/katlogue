import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as platformAdminPushTokenService from '../services/platform-admin-push-token.service.js'
import type { DeletePushTokenBody } from '../validations/notification.validation.js'

export const deletePlatformAdminPushToken = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.authUser) {
      throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
    }

    const body = req.body as DeletePushTokenBody
    const data = await platformAdminPushTokenService.unregisterPlatformAdminPushToken(
      req.authUser.id,
      body.expo_push_token
    )

    res.status(200).json({
      success: true,
      message: data.removed ? 'Admin push token removed' : 'Admin push token was not registered',
      data,
    })
  }
)
