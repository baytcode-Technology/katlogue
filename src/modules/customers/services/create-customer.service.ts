import { randomUUID } from 'node:crypto'
import * as customerRepository from '../repositories/customer.repository.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { normalizeWhatsAppNumber } from '../../../shared/utils/phone.js'
import type { CreateCustomerBody } from '../validations/customer.validation.js'

function isOfflinePlaceholder(number: string): boolean {
  return number.startsWith('offline-')
}

export async function createCustomer(ownerId: string, body: CreateCustomerBody) {
  await storeRepository.assertStoreOwner(body.store_id, ownerId)

  const phone = body.phone?.trim()
  const whatsapp_number = phone
    ? normalizeWhatsAppNumber(phone)
    : `offline-${randomUUID().replace(/-/g, '').slice(0, 16)}`

  const customer = await customerRepository.insertCustomer({
    store_id: body.store_id,
    whatsapp_number,
    name: body.name.trim(),
    email: body.email?.trim() || null,
  })

  return {
    ...customer,
    display_phone: phone && !isOfflinePlaceholder(whatsapp_number) ? phone : null,
  }
}
