import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as razorpaySetupTestService from '../services/razorpay-setup-test.service.js'
import type { RequiredStoreQuery } from '../../stores/validations/store.validation.js'

export const createRazorpaySetupTestCheckout = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const { store_id } = req.validatedQuery as RequiredStoreQuery
  const data = await razorpaySetupTestService.createRazorpaySetupTestCheckout(
    req.authUser.id,
    store_id
  )
  res.status(200).json({ success: true, message: 'Razorpay setup test started', data })
})
