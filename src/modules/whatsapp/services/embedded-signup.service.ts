import axios from 'axios'
import { env } from '../../../config/env.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { normalizeWhatsAppNumber } from '../../../shared/utils/phone.js'
import {
  isHostedEmbeddedSignupUrl,
  logSignupUrlClassification,
} from './signup-url-classifier.js'

export type MetaTokenExchangeResult = {
  accessToken: string
  tokenType: string | null
  expiresIn: number | null
}

export type MetaPhoneNumberAsset = {
  phoneNumberId: string
  displayPhoneNumber: string | null
  wabaId: string | null
  verifiedName: string | null
}

export const WHATSAPP_APP_AUTH_REDIRECT_URI = 'aishopyapp://whatsapp-oauth'

function assertMetaOAuthConfigured() {
  if (!env.META.APP_ID || !env.META.APP_SECRET || !env.META.OAUTH_REDIRECT_URI) {
    throw new AppError(
      503,
      'Meta OAuth is not configured on this server',
      'META_OAUTH_NOT_CONFIGURED'
    )
  }
}

const EMBEDDED_SIGNUP_EXTRAS = {
  setup: {},
  version: 'v4',
  sessionInfoVersion: '3',
  featureType: 'whatsapp_business_app_onboarding',
} as const

/**
 * Facebook Login for Business OAuth dialog with Embedded Signup v4 extras.
 * Uses dialog/oauth (not business.facebook.com/onboard) so Meta 302s to redirect_uri
 * with ?code= — required for Custom Tabs / openAuthSessionAsync completion.
 */
export function buildEmbeddedSignupDialogUrl(input: { state: string }): string {
  assertMetaOAuthConfigured()
  if (!env.META.EMBEDDED_SIGNUP_CONFIG_ID) {
    return buildLegacyMetaOAuthUrl(input)
  }

  const params: Record<string, string> = {
    client_id: env.META.APP_ID!,
    config_id: env.META.EMBEDDED_SIGNUP_CONFIG_ID!,
    redirect_uri: env.META.OAUTH_REDIRECT_URI!,
    response_type: 'code',
    override_default_response_type: 'true',
    state: input.state,
    scope: ['whatsapp_business_management', 'whatsapp_business_messaging'].join(','),
    extras: JSON.stringify(EMBEDDED_SIGNUP_EXTRAS),
    display: 'page',
  }

  const qs = new URLSearchParams(params).toString()
  const url = `https://www.facebook.com/${encodeURIComponent(env.WHATSAPP.API_VERSION)}/dialog/oauth?${qs}`

  if (isHostedEmbeddedSignupUrl(url)) {
    throw new AppError(
      500,
      'Internal error: generated Hosted ES URL instead of OAuth dialog',
      'HOSTED_ES_URL_BLOCKED'
    )
  }

  logSignupUrlClassification({ context: 'buildEmbeddedSignupDialogUrl', url })
  return url
}

/** Same-origin launch URL — auth session opens our domain, then 302 to Meta OAuth dialog. */
export function buildWhatsAppOAuthLaunchUrl(input: {
  state: string
  apiBaseUrl: string
}): string {
  const base = input.apiBaseUrl.replace(/\/$/, '')
  return `${base}/api/whatsapp/oauth/launch?state=${encodeURIComponent(input.state)}`
}

export function buildMetaOAuthUrl(input: { state: string }): string {
  return buildEmbeddedSignupDialogUrl(input)
}

function buildLegacyMetaOAuthUrl(input: { state: string }): string {
  assertMetaOAuthConfigured()

  const params: Record<string, string> = {
    client_id: env.META.APP_ID!,
    redirect_uri: env.META.OAUTH_REDIRECT_URI!,
    response_type: 'code',
    state: input.state,
    scope: ['whatsapp_business_management', 'whatsapp_business_messaging'].join(','),
  }

  const qs = new URLSearchParams(params).toString()
  return `https://www.facebook.com/${encodeURIComponent(env.WHATSAPP.API_VERSION)}/dialog/oauth?${qs}`
}

async function requestAccessTokenFromCode(
  code: string,
  includeRedirectUri: boolean
): Promise<MetaTokenExchangeResult> {
  const url = `https://graph.facebook.com/${env.WHATSAPP.API_VERSION}/oauth/access_token`
  const params: Record<string, string> = {
    client_id: env.META.APP_ID!,
    client_secret: env.META.APP_SECRET!,
    code,
  }

  if (includeRedirectUri && env.META.OAUTH_REDIRECT_URI) {
    params.redirect_uri = env.META.OAUTH_REDIRECT_URI
  }

  const { data } = await axios.get<{
    access_token?: string
    token_type?: string
    expires_in?: number
    error?: { message?: string }
  }>(url, { params, timeout: 15_000 })

  const accessToken = data.access_token?.trim()
  if (!accessToken) {
    const detail = data.error?.message?.trim()
    throw new AppError(
      502,
      detail ? `Meta token exchange failed: ${detail}` : 'Meta did not return an access token',
      'META_OAUTH_NO_TOKEN'
    )
  }

  return {
    accessToken,
    tokenType: data.token_type ?? null,
    expiresIn: typeof data.expires_in === 'number' ? data.expires_in : null,
  }
}

export async function exchangeCodeForAccessToken(code: string): Promise<MetaTokenExchangeResult> {
  assertMetaOAuthConfigured()

  const useEmbeddedSignup = Boolean(env.META.EMBEDDED_SIGNUP_CONFIG_ID)

  try {
    if (useEmbeddedSignup) {
      try {
        return await requestAccessTokenFromCode(code, false)
      } catch {
        return await requestAccessTokenFromCode(code, true)
      }
    }

    return await requestAccessTokenFromCode(code, true)
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError(400, 'Failed to exchange Meta OAuth code', 'META_OAUTH_EXCHANGE_FAILED')
  }
}

/** Resolve WABA ID from token via debug_token granular_scopes (no business_management). */
export async function fetchWabaFromAccessToken(accessToken: string): Promise<string | null> {
  assertMetaOAuthConfigured()

  try {
    const appAccessToken = `${env.META.APP_ID}|${env.META.APP_SECRET}`
    const { data } = await axios.get<{
      data?: {
        granular_scopes?: Array<{ scope?: string; target_ids?: string[] }>
      }
    }>(`https://graph.facebook.com/${env.WHATSAPP.API_VERSION}/debug_token`, {
      params: {
        input_token: accessToken,
        access_token: appAccessToken,
      },
      timeout: 15_000,
    })

    for (const entry of data.data?.granular_scopes ?? []) {
      if (entry.scope === 'whatsapp_business_management' && entry.target_ids?.[0]) {
        return String(entry.target_ids[0])
      }
    }

    return null
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.warn('[whatsapp] fetchWabaFromAccessToken failed %s', message)
    return null
  }
}

/** Exchange short-lived token for long-lived token (60 days). */
export async function exchangeForLongLivedToken(
  shortLivedToken: string
): Promise<MetaTokenExchangeResult> {
  assertMetaOAuthConfigured()

  try {
    const { data } = await axios.get<{
      access_token?: string
      token_type?: string
      expires_in?: number
    }>(`https://graph.facebook.com/${env.WHATSAPP.API_VERSION}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: env.META.APP_ID!,
        client_secret: env.META.APP_SECRET!,
        fb_exchange_token: shortLivedToken,
      },
      timeout: 15_000,
    })

    const accessToken = data.access_token?.trim()
    if (!accessToken) {
      throw new AppError(502, 'Meta did not return a long-lived token', 'META_OAUTH_NO_TOKEN')
    }

    return {
      accessToken,
      tokenType: data.token_type ?? null,
      expiresIn: typeof data.expires_in === 'number' ? data.expires_in : null,
    }
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError(400, 'Failed to get long-lived token', 'META_OAUTH_LONG_LIVED_FAILED')
  }
}

/** Resolve phone number details from a known phone number ID. */
export async function fetchPhoneNumberDetails(input: {
  phoneNumberId: string
  accessToken: string
  wabaId?: string | null
}): Promise<MetaPhoneNumberAsset | null> {
  try {
    const { data } = await axios.get<{
      id?: string
      display_phone_number?: string
      verified_name?: string
    }>(
      `https://graph.facebook.com/${env.WHATSAPP.API_VERSION}/${input.phoneNumberId}`,
      {
        params: {
          fields: 'display_phone_number,verified_name',
          access_token: input.accessToken,
        },
        timeout: 15_000,
      }
    )

    if (!data.id) return null

    return {
      phoneNumberId: data.id,
      displayPhoneNumber: data.display_phone_number
        ? normalizeWhatsAppNumber(data.display_phone_number)
        : null,
      wabaId: input.wabaId ?? null,
      verifiedName: data.verified_name ?? null,
    }
  } catch {
    return null
  }
}

/** List phone numbers under a WABA (uses whatsapp_business_management, not business_management). */
export async function fetchPhoneFromWaba(input: {
  wabaId: string
  accessToken: string
}): Promise<MetaPhoneNumberAsset | null> {
  try {
    const { data: phones } = await axios.get<{
      data?: Array<{
        id?: string
        display_phone_number?: string
        verified_name?: string
      }>
    }>(
      `https://graph.facebook.com/${env.WHATSAPP.API_VERSION}/${input.wabaId}/phone_numbers`,
      { params: { access_token: input.accessToken }, timeout: 15_000 }
    )

    const phone = phones.data?.[0]
    if (!phone?.id) return null

    return {
      phoneNumberId: phone.id,
      displayPhoneNumber: phone.display_phone_number
        ? normalizeWhatsAppNumber(phone.display_phone_number)
        : null,
      wabaId: input.wabaId,
      verifiedName: phone.verified_name ?? null,
    }
  } catch {
    return null
  }
}

/** Subscribe app to webhooks on the merchant WABA (required after Embedded Signup). */
export async function subscribeWhatsAppWebhooks(input: {
  wabaId: string
  accessToken: string
}): Promise<void> {
  try {
    const { data } = await axios.post<{ success?: boolean }>(
      `https://graph.facebook.com/${env.WHATSAPP.API_VERSION}/${input.wabaId}/subscribed_apps`,
      null,
      {
        params: { access_token: input.accessToken },
        timeout: 15_000,
      }
    )

    if (data.success === false) {
      throw new Error('Meta returned success=false')
    }

    console.info('[whatsapp] subscribed_apps ok wabaId=%s', input.wabaId)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.warn('[whatsapp] subscribed_apps failed wabaId=%s %s', input.wabaId, message)
    throw err
  }
}

/** Check if phone number is on Business App + Cloud API (coexistence). */
export async function fetchPhoneCoexistenceStatus(input: {
  phoneNumberId: string
  accessToken: string
}): Promise<{ isOnBizApp: boolean; platformType: string | null }> {
  try {
    const { data } = await axios.get<{
      is_on_biz_app?: boolean
      platform_type?: string
    }>(
      `https://graph.facebook.com/${env.WHATSAPP.API_VERSION}/${input.phoneNumberId}`,
      {
        params: {
          fields: 'is_on_biz_app,platform_type',
          access_token: input.accessToken,
        },
        timeout: 10_000,
      }
    )

    return {
      isOnBizApp: Boolean(data.is_on_biz_app),
      platformType: data.platform_type ?? null,
    }
  } catch {
    return { isOnBizApp: false, platformType: null }
  }
}
