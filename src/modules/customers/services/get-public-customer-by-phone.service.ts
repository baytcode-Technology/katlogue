import {
  findCustomerByPhone,
  findOrderSummariesForCustomer,
} from '../repositories/customer.repository.js'
import type { PublicCustomerByPhone } from '../types/customer.types.js'

export async function getPublicCustomerByPhoneService(
  storeId: number,
  phone: string
): Promise<PublicCustomerByPhone | null> {
  const customer = await findCustomerByPhone(storeId, phone)
  if (!customer) return null

  const orders = await findOrderSummariesForCustomer(storeId, customer.order_ids)

  return {
    id: customer.id,
    name: customer.name,
    phone_number: customer.whatsapp_number,
    shipping_addresses: customer.shipping_addresses,
    orders,
  }
}
