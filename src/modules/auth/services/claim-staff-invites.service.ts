import * as storeStaffRepository from '../../stores/repositories/store-staff.repository.js'
import type { VerifyOtpResult } from '../types/auth.types.js'

export async function claimStaffInvitesForUser(
  result: VerifyOtpResult
): Promise<VerifyOtpResult> {
  if (result.user.email) {
    await storeStaffRepository
      .claimPendingStaffInvites(result.user.id, result.user.email)
      .catch(() => undefined)
  }
  return result
}
