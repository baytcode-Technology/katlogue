import * as orderRepository from '../repositories/order.repository.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import type { OrderItem } from '../types/order.types.js'
import type { OrderWithCustomer } from '../repositories/order.repository.js'

export type OrderListItem = OrderWithCustomer & {
  items: OrderItem[]
  item_quantity: number
}

export async function listOrdersByStore(
  ownerId: string,
  storeId: number
): Promise<OrderListItem[]> {
  await storeRepository.assertStoreMember(storeId, ownerId)

  const orders = (await orderRepository.findOrdersByStoreId(storeId)).filter(
    (order) => order.source !== 'razorpay_setup_test'
  )
  const orderIds = orders.map((o) => o.id)
  const allItems = await orderRepository.findOrderItemsByOrderIds(orderIds)

  const itemsByOrder = new Map<number, OrderItem[]>()
  for (const item of allItems) {
    const list = itemsByOrder.get(item.order_id) ?? []
    list.push(item)
    itemsByOrder.set(item.order_id, list)
  }

  return orders.map((order) => {
    const items = itemsByOrder.get(order.id) ?? []
    const item_quantity = items.reduce((sum, item) => sum + item.quantity, 0)
    return {
      ...order,
      items,
      item_quantity,
    }
  })
}
