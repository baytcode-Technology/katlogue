import * as authRepository from '../repositories/auth.repository.js'
import * as claimStaffInvitesService from './claim-staff-invites.service.js'
import { verifyGoogleIdToken } from './verify-google-id-token.service.js'
import type { VerifyOtpResult } from '../types/auth.types.js'
import { AppError } from '../../../shared/errors/app.error.js'

export async function signInWithGoogle(input: {
  idToken: string
}): Promise<VerifyOtpResult> {
  try {
    const result = await authRepository.signInWithGoogleIdToken(input.idToken)
    return claimStaffInvitesService.claimStaffInvitesForUser(result)
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== 'GOOGLE_NONCE_REQUIRED') {
      throw error
    }
  }

  const profile = await verifyGoogleIdToken(input.idToken)
  const result = await authRepository.createSessionForGoogleProfile(profile)
  return claimStaffInvitesService.claimStaffInvitesForUser(result)
}
