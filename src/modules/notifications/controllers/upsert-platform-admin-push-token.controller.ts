import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as platformAdminPushTokenService from '../services/platform-admin-push-token.service.js'
import type { UpsertPushTokenBody } from '../validations/notification.validation.js'

export const upsertPlatformAdminPushToken = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.authUser) {
      throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
    }

    const body = req.body as UpsertPushTokenBody
    const data = await platformAdminPushTokenService.registerPlatformAdminPushToken(
      req.authUser.id,
      body
    )

    res.status(200).json({
      success: true,
      message: 'Admin push token registered',
      data,
    })
  }
)
