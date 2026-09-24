import { notifyPlatformAdminsUserSignedUp } from '../../notifications/services/notify-platform-admins.service.js'
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

  if (result.user.isNewUser) {
    void notifyPlatformAdminsUserSignedUp({
      userId: result.user.id,
      email: result.user.email,
    }).catch((err) => {
      console.error('[notifications] platform admin signup push failed', err)
    })
  }

  return result
}
