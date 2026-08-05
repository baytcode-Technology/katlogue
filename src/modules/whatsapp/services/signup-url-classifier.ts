/**
 * Meta exposes two different onboarding products that look similar in the UI:
 *
 * - Hosted Embedded Signup: business.facebook.com/messaging/whatsapp/onboard/
 *   Completes on Meta's domain; delivers assets via account_update webhook — NO OAuth code.
 *
 * - Custom Embedded Signup (Facebook Login for Business): www.facebook.com/.../dialog/oauth
 *   With config_id + response_type=code; redirects to redirect_uri with ?code=.
 */

export type WhatsAppSignupUrlType =
  | 'hosted-embedded-signup'
  | 'embedded-signup-sdk-bridge'
  | 'custom-es-oauth-dialog'
  | 'legacy-oauth-dialog'
  | 'oauth-launch-redirect'
  | 'unknown'

const HOSTED_ES_PATH = '/messaging/whatsapp/onboard'

export function classifyWhatsAppSignupUrl(url: string): WhatsAppSignupUrlType {
  try {
    const parsed = new URL(url)

    if (
      parsed.hostname === 'business.facebook.com' &&
      parsed.pathname.includes(HOSTED_ES_PATH)
    ) {
      return 'hosted-embedded-signup'
    }

    if (parsed.pathname.includes('/api/whatsapp/embedded-signup')) {
      return 'embedded-signup-sdk-bridge'
    }

    if (parsed.pathname.includes('/api/whatsapp/oauth/launch')) {
      return 'oauth-launch-redirect'
    }

    if (parsed.pathname.includes('/dialog/oauth')) {
      return parsed.searchParams.has('config_id')
        ? 'custom-es-oauth-dialog'
        : 'legacy-oauth-dialog'
    }

    return 'unknown'
  } catch {
    return 'unknown'
  }
}

export function isHostedEmbeddedSignupUrl(url: string): boolean {
  return classifyWhatsAppSignupUrl(url) === 'hosted-embedded-signup'
}

export function describeSignupUrlType(type: WhatsAppSignupUrlType): string {
  switch (type) {
    case 'hosted-embedded-signup':
      return 'Hosted ES (business.facebook.com/onboard) — NO OAuth code; webhook-only completion'
    case 'embedded-signup-sdk-bridge':
      return 'Embedded Signup JS SDK bridge (FB.login + WA_EMBEDDED_SIGNUP postMessage)'
    case 'custom-es-oauth-dialog':
      return 'Custom Embedded Signup OAuth dialog (facebook.com/dialog/oauth + config_id)'
    case 'legacy-oauth-dialog':
      return 'Legacy OAuth dialog (facebook.com/dialog/oauth, no config_id)'
    case 'oauth-launch-redirect':
      return 'Same-origin launch redirect → Meta OAuth dialog'
    default:
      return 'Unknown signup URL type'
  }
}

export function logSignupUrlClassification(input: {
  context: string
  url: string
  extra?: Record<string, unknown>
}): WhatsAppSignupUrlType {
  const urlType = classifyWhatsAppSignupUrl(input.url)
  const payload = {
    context: input.context,
    urlType,
    description: describeSignupUrlType(urlType),
    urlHost: (() => {
      try {
        return new URL(input.url).hostname
      } catch {
        return 'invalid'
      }
    })(),
    urlPath: (() => {
      try {
        return new URL(input.url).pathname
      } catch {
        return null
      }
    })(),
    hasConfigId: (() => {
      try {
        return new URL(input.url).searchParams.has('config_id')
      } catch {
        return false
      }
    })(),
    hasRedirectUri: (() => {
      try {
        return new URL(input.url).searchParams.has('redirect_uri')
      } catch {
        return false
      }
    })(),
    ...input.extra,
  }

  if (urlType === 'hosted-embedded-signup') {
    console.error('[whatsapp][signup-url] HOSTED ES URL DETECTED — will NOT produce OAuth code', payload)
  } else {
    console.info('[whatsapp][signup-url] classified', payload)
  }

  return urlType
}
