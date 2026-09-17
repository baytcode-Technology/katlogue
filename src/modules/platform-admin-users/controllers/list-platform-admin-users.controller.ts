import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import * as listPlatformAdminUsersService from '../services/list-platform-admin-users.service.js'
import type { ListPlatformAdminUsersQueryInput } from '../validations/platform-admin-users.validation.js'

export const listPlatformAdminUsers = asyncHandler(async (req: Request, res: Response) => {
  const query = req.validatedQuery as ListPlatformAdminUsersQueryInput
  const result = await listPlatformAdminUsersService.listPlatformAdminUsers(query)

  res.json({
    success: true,
    message: 'Users fetched',
    data: result,
  })
})
