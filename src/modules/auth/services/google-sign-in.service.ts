import * as authRepository from '../repositories/auth.repository.js'
import type { VerifyOtpResult } from '../types/auth.types.js'

export async function signInWithGoogle(input: {
  idToken: string
}): Promise<VerifyOtpResult> {
  return authRepository.signInWithGoogleIdToken(input.idToken)
}
