import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as createOrderService from '../services/create-order.service.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import type { MerchantCreateOrderBody } from '../validations/merchant-order.validation.js'

export const createMerchantOrder = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) {
    throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')
  }

  const body = req.body as MerchantCreateOrderBody
  const store = await storeRepository.findStoreById(body.store_id)
  if (!store) {
    throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  }
  await storeRepository.assertStoreOwner(body.store_id, req.authUser.id)

  const { store_id: _storeId, ...orderInput } = body
  const isPos = orderInput.offline === true
  const result = await createOrderService.createOrder(store.id, store.currency, {
    ...orderInput,
    source: isPos ? 'offline' : 'whatsapp',
  })

  res.status(201).json({
    success: true,
    message:
      body.payment_method === 'cod'
        ? 'Order created successfully (cash on delivery)'
        : 'Order created — payment pending',
    data: result,
  })
})
