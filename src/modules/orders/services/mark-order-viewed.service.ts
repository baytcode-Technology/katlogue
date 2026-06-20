import * as orderRepository from '../repositories/order.repository.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type { OrderWithCustomer } from '../repositories/order.repository.js'

export async function markOrderViewedByMerchant(
  ownerId: string,
  storeId: number,
  orderId: number
): Promise<OrderWithCustomer> {
  await storeRepository.assertStoreOwner(storeId, ownerId)

  const order = await orderRepository.findOrderById(orderId)
  if (!order || order.store_id !== storeId) {
    throw new AppError(404, 'Order not found', 'ORDER_NOT_FOUND')
  }

  return orderRepository.markOrderViewedByMerchant(orderId, storeId)
}
