import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as deleteAccountService from '../services/delete-account.service.js'

export const deleteAccount = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

  await deleteAccountService.deleteAccount(req.authUser.id)

  res.status(200).json({
    success: true,
    message: 'Account deleted',
  })
})
