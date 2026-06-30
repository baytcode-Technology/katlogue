import { AppError } from '../../../shared/errors/app.error.js'
import * as storeStaffRepository from '../repositories/store-staff.repository.js'
import type { StaffListMember } from '../types/store-staff.types.js'
import type { StoreStaffRow } from '../types/store-staff.types.js'

export async function listStoreStaff(
  ownerId: string,
  storeId: number
): Promise<StaffListMember[]> {
  const role = await storeStaffRepository.assertStoreMember(storeId, ownerId)
  if (role !== 'owner') {
    throw new AppError(403, 'Only the store owner can view staff', 'FORBIDDEN')
  }
  return storeStaffRepository.listStaffForStore(storeId)
}

export async function inviteStoreStaff(
  ownerId: string,
  storeId: number,
  email: string
): Promise<StoreStaffRow> {
  return storeStaffRepository.inviteStaff(storeId, ownerId, email)
}

export async function removeStoreStaff(
  ownerId: string,
  storeId: number,
  staffId: number
): Promise<void> {
  await storeStaffRepository.removeStaff(storeId, ownerId, staffId)
}
