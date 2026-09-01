import { supabaseAdmin, supabaseAuth } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type { AuthSession, VerifyOtpResult } from '../types/auth.types.js'
import type { VerifiedGoogleProfile } from '../services/verify-google-id-token.service.js'

function mapAuthError(error: { message: string; status?: number }, fallback: string): never {
  const status = error.status ?? 400
  if (status === 429) {
    throw new AppError(429, 'Too many OTP requests. Please try again later.', 'RATE_LIMITED')
  }
  throw new AppError(status >= 400 && status < 500 ? status : 400, error.message || fallback, 'AUTH_ERROR')
}

export async function sendSignInOtp(email: string): Promise<void> {
  const { error } = await supabaseAuth.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
    },
  })

  if (error) {
    mapAuthError(error, 'Failed to send OTP')
  }
}

export async function verifySignInOtp(
  email: string,
  token: string
): Promise<VerifyOtpResult> {
  const { data, error } = await supabaseAuth.auth.verifyOtp({
    email,
    token,
    type: 'email',
  })

  if (error || !data.session || !data.user) {
    mapAuthError(error ?? { message: 'Invalid or expired OTP' }, 'Invalid or expired OTP')
  }

  const { user, session } = data

  return buildAuthResult(user, session)
}

export async function refreshAuthSession(refreshToken: string): Promise<VerifyOtpResult> {
  const { data, error } = await supabaseAuth.auth.refreshSession({ refresh_token: refreshToken })

  if (error || !data.session || !data.user) {
    throw new AppError(
      401,
      error?.message ?? 'Invalid or expired refresh token',
      'INVALID_REFRESH_TOKEN'
    )
  }

  return buildAuthResult(data.user, data.session)
}

function nonceError(message: string): boolean {
  return /nonce/i.test(message)
}

export async function signInWithGoogleIdToken(idToken: string): Promise<VerifyOtpResult> {
  const { data, error } = await supabaseAuth.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  })

  if (!error && data.session && data.user) {
    return buildAuthResult(data.user, data.session)
  }

  if (error && !nonceError(error.message)) {
    mapAuthError(error, 'Google sign-in failed')
  }

  throw new AppError(401, error?.message ?? 'Google sign-in failed', 'GOOGLE_NONCE_REQUIRED')
}

export async function signInWithAppleIdToken(idToken: string): Promise<VerifyOtpResult> {
  const { data, error } = await supabaseAuth.auth.signInWithIdToken({
    provider: 'apple',
    token: idToken,
  })

  if (error || !data.session || !data.user) {
    mapAuthError(error ?? { message: 'Apple sign-in failed' }, 'Apple sign-in failed')
  }

  return buildAuthResult(data.user, data.session)
}

export async function updateUserFullNameMetadata(
  userId: string,
  fullName: {
    givenName?: string
    middleName?: string
    familyName?: string
  }
): Promise<void> {
  const nameParts = [fullName.givenName, fullName.middleName, fullName.familyName].filter(
    (part): part is string => Boolean(part && part.trim())
  )
  if (nameParts.length === 0) return

  const displayName = nameParts.join(' ')
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      full_name: displayName,
      name: displayName,
      given_name: fullName.givenName ?? null,
      family_name: fullName.familyName ?? null,
    },
  })

  if (error) {
    // Name is best-effort; do not fail the sign-in session.
    console.warn('[auth] Apple full name metadata update failed:', error.message)
  }
}

export async function createSessionForGoogleProfile(
  profile: VerifiedGoogleProfile
): Promise<VerifyOtpResult> {
  const { error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: profile.email,
    email_confirm: true,
    user_metadata: {
      full_name: profile.name,
      name: profile.name,
      avatar_url: profile.picture,
      picture: profile.picture,
      email_verified: true,
      provider_id: profile.sub,
    },
    app_metadata: {
      provider: 'google',
      providers: ['google'],
    },
  })

  if (
    createError &&
    !/already|registered|exists|duplicate/i.test(createError.message)
  ) {
    throw new AppError(400, createError.message, 'GOOGLE_USER_CREATE_FAILED')
  }

  const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: profile.email,
  })

  const tokenHash = link?.properties?.hashed_token
  if (linkError || !tokenHash) {
    throw new AppError(
      400,
      linkError?.message ?? 'Could not create Google session',
      'GOOGLE_SESSION_FAILED'
    )
  }

  const { data, error } = await supabaseAuth.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'email',
  })

  if (error || !data.session || !data.user) {
    mapAuthError(error ?? { message: 'Google sign-in failed' }, 'Google sign-in failed')
  }

  return buildAuthResult(data.user, data.session)
}

function buildAuthResult(
  user: {
    id: string
    email?: string
    created_at: string
    last_sign_in_at?: string
  },
  session: {
    access_token: string
    refresh_token: string
    expires_in: number
    expires_at?: number
    token_type: string
  }
): VerifyOtpResult {
  const isNewUser = (() => {
    const createdAt = user.created_at
    const lastSignIn = user.last_sign_in_at
    if (!createdAt || !lastSignIn) return false
    return Math.abs(new Date(createdAt).getTime() - new Date(lastSignIn).getTime()) < 5000
  })()

  return {
    user: {
      id: user.id,
      email: user.email,
      createdAt: user.created_at,
      isNewUser,
    },
    session: mapSession(session),
  }
}

export async function deleteUserAccount(userId: string): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)

  if (error) {
    throw new AppError(400, error.message || 'Failed to delete account', 'ACCOUNT_DELETE_FAILED')
  }
}

function mapSession(session: {
  access_token: string
  refresh_token: string
  expires_in: number
  expires_at?: number
  token_type: string
}): AuthSession {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresIn: session.expires_in,
    expiresAt: session.expires_at ?? 0,
    tokenType: session.token_type,
  }
}
