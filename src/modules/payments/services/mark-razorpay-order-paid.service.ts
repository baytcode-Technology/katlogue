import * as orderRepository from '../../orders/repositories/order.repository.js'
import type { Order, Payment } from '../../orders/types/order.types.js'

export async function markRazorpayOrderPaid(input: {
  payment: Payment
  providerPaymentId: string
  paidAt?: string
}): Promise<{ order: Order; payment: Payment }> {
  const paidAt = input.paidAt ?? new Date().toISOString()

  if (input.payment.status === 'paid' && input.payment.provider_payment_id) {
    const order = await orderRepository.findOrderById(input.payment.order_id)
    if (!order) {
      throw new Error('Order not found after paid payment')
    }
    return { order, payment: input.payment }
  }

  const payment = await orderRepository.updatePayment(input.payment.id, {
    status: 'paid',
    provider_payment_id: input.providerPaymentId,
    paid_at: paidAt,
  })

  const order = await orderRepository.updateOrder(input.payment.order_id, {
    payment_status: 'paid',
    order_status: 'confirmed',
  })

  return { order, payment }
}
