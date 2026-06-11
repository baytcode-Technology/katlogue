import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import * as refreshTokenService from '../services/refresh-token.service.js'
import type { RefreshTokenInput } from '../validations/auth.validation.js'

export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as RefreshTokenInput
  const result = await refreshTokenService.refreshAuthSession(input)

  res.status(200).json({
    success: true,
    message: 'Session refreshed',
    data: result,
  })
})
