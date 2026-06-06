import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as createCustomerService from '../services/create-customer.service.js'
import type { CreateCustomerBody } from '../validations/customer.validation.js'

export const createCustomer = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const body = req.body as CreateCustomerBody
  const customer = await createCustomerService.createCustomer(req.authUser.id, body)

  res.status(201).json({
    success: true,
    message: 'Customer created',
    data: customer,
  })
})
