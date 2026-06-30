import * as authRepository from '../repositories/auth.repository.js'
import * as claimStaffInvitesService from './claim-staff-invites.service.js'
import type { VerifyOtpResult } from '../types/auth.types.js'

export async function signInWithGoogle(input: {
  idToken: string
}): Promise<VerifyOtpResult> {
  const result = await authRepository.signInWithGoogleIdToken(input.idToken)
  return claimStaffInvitesService.claimStaffInvitesForUser(result)
}
