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

export type SignInInput = z.infer<typeof signInSchema>
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>
export type GoogleSignInInput = z.infer<typeof googleSignInSchema>
