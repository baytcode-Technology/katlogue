import * as customerRepository from '../repositories/customer.repository.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'

export async function listCustomersByStore(ownerId: string, storeId: number) {
  await storeRepository.assertStoreMember(storeId, ownerId)
  return customerRepository.findCustomersByStoreId(storeId)
}
