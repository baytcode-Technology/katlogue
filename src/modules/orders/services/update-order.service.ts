import * as orderRepository from '../repositories/order.repository.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type { Order, UpdateOrderInput } from '../types/order.types.js'

export async function updateOrderStatuses(
  ownerId: string,
  storeId: string,
  orderId: string,
  input: UpdateOrderInput
): Promise<Order> {
  await storeRepository.assertStoreOwner(storeId, ownerId)

  const existing = await orderRepository.findOrderById(orderId)
  if (!existing || existing.store_id !== storeId) {
    throw new AppError(404, 'Order not found', 'ORDER_NOT_FOUND')
  }

  return orderRepository.updateOrder(orderId, input)
}

