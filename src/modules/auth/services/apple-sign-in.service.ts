import * as authRepository from '../repositories/auth.repository.js'
import * as claimStaffInvitesService from './claim-staff-invites.service.js'
import type { VerifyOtpResult } from '../types/auth.types.js'

export async function signInWithApple(input: {
  idToken: string
  fullName?: {
    givenName?: string
    middleName?: string
    familyName?: string
  }
}): Promise<VerifyOtpResult> {
  const result = await authRepository.signInWithAppleIdToken(input.idToken)

  if (input.fullName) {
    await authRepository.updateUserFullNameMetadata(result.user.id, input.fullName)
  }

  return claimStaffInvitesService.claimStaffInvitesForUser(result)
}
