import * as authRepository from '../repositories/auth.repository.js'
import * as claimStaffInvitesService from './claim-staff-invites.service.js'
import type { VerifyOtpInput } from '../validations/auth.validation.js'
import type { VerifyOtpResult } from '../types/auth.types.js'

export async function verifySignInOtp(input: VerifyOtpInput): Promise<VerifyOtpResult> {
  const result = await authRepository.verifySignInOtp(
    input.email.toLowerCase().trim(),
    input.otp.trim()
  )

  return claimStaffInvitesService.claimStaffInvitesForUser(result)
}
