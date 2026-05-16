import * as authRepository from '../repositories/auth.repository.js'
import type { VerifyOtpInput } from '../validations/auth.validation.js'
import type { VerifyOtpResult } from '../types/auth.types.js'

export async function verifySignInOtp(input: VerifyOtpInput): Promise<VerifyOtpResult> {
  return authRepository.verifySignInOtp(
    input.email.toLowerCase().trim(),
    input.otp.trim()
  )
}
