import * as storeStaffRepository from '../repositories/store-staff.repository.js'
import type { StoreWithRole } from '../types/store-staff.types.js'

export async function listMyStores(userId: string): Promise<StoreWithRole[]> {
  return storeStaffRepository.findStoresForUser(userId)
}
