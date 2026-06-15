import type { Request, Response } from 'express'
import { AppError } from '../../../shared/errors/app.error.js'
import { getPublicCustomerByPhoneService } from '../services/get-public-customer-by-phone.service.js'
import type { PublicCustomerByPhoneQuery } from '../validations/customer.validation.js'

export async function getPublicCustomerByPhone(req: Request, res: Response): Promise<void> {
  if (!req.store) {
    throw new AppError(400, 'Store not resolved', 'STORE_NOT_RESOLVED')
  }

  const { phone } = req.query as unknown as PublicCustomerByPhoneQuery
  const customer = await getPublicCustomerByPhoneService(req.store.id, phone)

  if (!customer) {
    throw new AppError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND')
  }

  res.json({
    success: true,
    data: { customer },
  })
}
