import { env, isGoogleOAuthConfigured } from '../../../config/env.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as authRepository from '../repositories/auth.repository.js'
import type { VerifyOtpResult } from '../types/auth.types.js'

type GoogleTokenResponse = {
  id_token?: string
  access_token?: string
  error?: string
  error_description?: string
}

export async function signInWithGoogleAuthCode(input: {
  code: string
  redirectUri: string
  codeVerifier: string
}): Promise<VerifyOtpResult> {
  const idToken = await exchangeGoogleAuthCode(input)
  return authRepository.signInWithGoogleIdToken(idToken)
}

async function exchangeGoogleAuthCode(input: {
  code: string
  redirectUri: string
  codeVerifier: string
}): Promise<string> {
  if (!isGoogleOAuthConfigured()) {
    throw new AppError(
      503,
      'Google OAuth is not configured on the server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
      'GOOGLE_NOT_CONFIGURED'
    )
  }

  const body = new URLSearchParams({
    client_id: env.GOOGLE.CLIENT_ID,
    client_secret: env.GOOGLE.CLIENT_SECRET,
    code: input.code,
    redirect_uri: input.redirectUri,
    grant_type: 'authorization_code',
    code_verifier: input.codeVerifier,
  })

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  const data = (await response.json()) as GoogleTokenResponse

  if (!response.ok || data.error) {
    const message =
      data.error_description ?? data.error ?? 'Google token exchange failed'
    throw new AppError(400, message, 'GOOGLE_TOKEN_EXCHANGE_FAILED')
  }

  if (!data.id_token) {
    throw new AppError(
      400,
      'Google token exchange did not return an ID token',
      'GOOGLE_TOKEN_EXCHANGE_FAILED'
    )
  }

  return data.id_token
}
