import * as orderRepository from '../repositories/order.repository.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type { Order, UpdateOrderInput } from '../types/order.types.js'

export async function updateOrderStatuses(
  ownerId: string,
  storeId: number,
  orderId: number,
  input: UpdateOrderInput
): Promise<Order> {
  await storeRepository.assertStoreOwner(storeId, ownerId)

  const existing = await orderRepository.findOrderById(orderId)
  if (!existing || existing.store_id !== storeId) {
    throw new AppError(404, 'Order not found', 'ORDER_NOT_FOUND')
  }

  const order = await orderRepository.updateOrder(orderId, input)

  if (input.payment_status === 'paid' || input.payment_status === 'refunded') {
    const payment = await orderRepository.findPaymentByOrderId(orderId)
    if (payment) {
      await orderRepository.updatePayment(payment.id, {
        status: input.payment_status === 'paid' ? 'paid' : 'refunded',
        paid_at: input.payment_status === 'paid' ? new Date().toISOString() : payment.paid_at,
      })
    }
  }

  return order
}

