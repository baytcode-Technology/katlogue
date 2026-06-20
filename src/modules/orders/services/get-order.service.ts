import * as orderRepository from '../repositories/order.repository.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type { OrderItem } from '../types/order.types.js'
import type { OrderWithCustomer } from '../repositories/order.repository.js'

import type { Payment } from '../types/order.types.js'

export type OrderDetail = OrderWithCustomer & {
  items: OrderItem[]
  payment: Payment | null
}

export async function getOrderById(
  ownerId: string,
  storeId: number,
  orderId: number
): Promise<OrderDetail> {
  await storeRepository.assertStoreOwner(storeId, ownerId)

  const order = await orderRepository.findOrderById(orderId)
  if (!order || order.store_id !== storeId) {
    throw new AppError(404, 'Order not found', 'ORDER_NOT_FOUND')
  }

  const [items, payment] = await Promise.all([
    orderRepository.findOrderItemsByOrderIds([orderId]),
    orderRepository.findPaymentByOrderId(orderId),
  ])

  return {
    ...order,
    items,
    payment,
  }
}

