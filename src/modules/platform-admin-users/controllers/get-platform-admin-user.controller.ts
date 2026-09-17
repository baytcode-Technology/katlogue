import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import * as getPlatformAdminUserService from '../services/get-platform-admin-user.service.js'
import type { PlatformAdminUserParams } from '../validations/platform-admin-users.validation.js'

export const getPlatformAdminUser = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params as PlatformAdminUserParams
  const detail = await getPlatformAdminUserService.getPlatformAdminUser(userId)

  res.json({
    success: true,
    message: 'User fetched',
    data: detail,
  })
})
