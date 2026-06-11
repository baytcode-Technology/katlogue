import { z } from 'zod'

export const signInSchema = z.object({
  email: z.email('Invalid email address'),
})

export const verifyOtpSchema = z.object({
  email: z.email('Invalid email address'),
  otp: z
    .string()
    .trim()
    .min(6, 'OTP must be at least 6 characters')
    .max(8, 'OTP must be at most 8 characters'),
})

export const googleSignInSchema = z.object({
  idToken: z.string().trim().min(1, 'Google ID token is required'),
})

export const googleCodeExchangeSchema = z.object({
  code: z.string().trim().min(1, 'Authorization code is required'),
  redirectUri: z.string().trim().url('Invalid redirect URI'),
  codeVerifier: z.string().trim().min(1, 'PKCE code verifier is required'),
})

export const refreshTokenSchema = z.object({
  refreshToken: z.string().trim().min(1, 'Refresh token is required'),
})

export type SignInInput = z.infer<typeof signInSchema>
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>
export type GoogleSignInInput = z.infer<typeof googleSignInSchema>
export type GoogleCodeExchangeInput = z.infer<typeof googleCodeExchangeSchema>
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>
