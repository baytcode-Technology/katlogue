import axios from 'axios'
import { env } from '../../../config/env.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { normalizeWhatsAppNumber } from '../../../shared/utils/phone.js'

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

function assertMetaOAuthConfigured() {
  if (!env.META.APP_ID || !env.META.APP_SECRET || !env.META.OAUTH_REDIRECT_URI) {
    throw new AppError(
      503,
      'Meta OAuth is not configured on this server',
      'META_OAUTH_NOT_CONFIGURED'
    )
  }
}

export function buildMetaOAuthUrl(input: { state: string }): string {
  assertMetaOAuthConfigured()

  const params: Record<string, string> = {
    client_id: env.META.APP_ID!,
    redirect_uri: env.META.OAUTH_REDIRECT_URI!,
    response_type: 'code',
    state: input.state,
    scope: [
      'business_management',
      'whatsapp_business_management',
      'whatsapp_business_messaging',
    ].join(','),
  }

  if (env.META.EMBEDDED_SIGNUP_CONFIG_ID) {
    params.config_id = env.META.EMBEDDED_SIGNUP_CONFIG_ID
  }

  const qs = new URLSearchParams(params).toString()
  return `https://www.facebook.com/${encodeURIComponent(env.WHATSAPP.API_VERSION)}/dialog/oauth?${qs}`
}

export async function exchangeCodeForAccessToken(code: string): Promise<MetaTokenExchangeResult> {
  assertMetaOAuthConfigured()

  const url = `https://graph.facebook.com/${env.WHATSAPP.API_VERSION}/oauth/access_token`

  try {
    const { data } = await axios.get<{
      access_token?: string
      token_type?: string
      expires_in?: number
    }>(url, {
      params: {
        client_id: env.META.APP_ID!,
        client_secret: env.META.APP_SECRET!,
        redirect_uri: env.META.OAUTH_REDIRECT_URI!,
        code,
      },
      timeout: 15_000,
    })

    const accessToken = data.access_token?.trim()
    if (!accessToken) {
      throw new AppError(502, 'Meta did not return an access token', 'META_OAUTH_NO_TOKEN')
    }

    return {
      accessToken,
      tokenType: data.token_type ?? null,
      expiresIn: typeof data.expires_in === 'number' ? data.expires_in : null,
    }
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError(400, 'Failed to exchange Meta OAuth code', 'META_OAUTH_EXCHANGE_FAILED')
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

/** Discover WABA + phone number from Graph API after OAuth. */
export async function fetchConnectedPhoneNumber(
  accessToken: string
): Promise<MetaPhoneNumberAsset | null> {
  try {
    const { data: businesses } = await axios.get<{
      data?: Array<{ id?: string }>
    }>(`https://graph.facebook.com/${env.WHATSAPP.API_VERSION}/me/businesses`, {
      params: { access_token: accessToken },
      timeout: 15_000,
    })

    for (const business of businesses.data ?? []) {
      if (!business.id) continue

      const { data: wabaData } = await axios.get<{
        data?: Array<{ id?: string; name?: string }>
      }>(
        `https://graph.facebook.com/${env.WHATSAPP.API_VERSION}/${business.id}/owned_whatsapp_business_accounts`,
        { params: { access_token: accessToken }, timeout: 15_000 }
      )

      for (const waba of wabaData.data ?? []) {
        if (!waba.id) continue

        const { data: phones } = await axios.get<{
          data?: Array<{
            id?: string
            display_phone_number?: string
            verified_name?: string
          }>
        }>(
          `https://graph.facebook.com/${env.WHATSAPP.API_VERSION}/${waba.id}/phone_numbers`,
          { params: { access_token: accessToken }, timeout: 15_000 }
        )

        const phone = phones.data?.[0]
        if (!phone?.id) continue

        return {
          phoneNumberId: phone.id,
          displayPhoneNumber: phone.display_phone_number
            ? normalizeWhatsAppNumber(phone.display_phone_number)
            : null,
          wabaId: waba.id,
          verifiedName: phone.verified_name ?? null,
        }
      }
    }

    return null
  } catch {
    return null
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
