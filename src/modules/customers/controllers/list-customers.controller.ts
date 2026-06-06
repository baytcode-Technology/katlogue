import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as listCustomersService from '../services/list-customers.service.js'
import type { ListCustomersQuery } from '../validations/customer.validation.js'

export const listCustomers = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const { store_id } = req.query as unknown as ListCustomersQuery
  const customers = await listCustomersService.listCustomersByStore(req.authUser.id, store_id)

  res.json({
    success: true,
    message: 'Customers fetched',
    data: { store_id, customers, count: customers.length },
  })
})
