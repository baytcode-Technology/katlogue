/** Mobile app OAuth return — must match aiShopy-app `INSTAGRAM_APP_AUTH_REDIRECT_URI`. */
export const INSTAGRAM_APP_AUTH_REDIRECT_URI = 'aishopyapp://instagram-oauth'

export function resolveInstagramAppRedirectUri(): string {
  return process.env.MOBILE_DEEP_LINK_URL?.trim() || INSTAGRAM_APP_AUTH_REDIRECT_URI
}

export function buildInstagramAppRedirect(params: Record<string, string>): string {
  return `${resolveInstagramAppRedirectUri()}?${new URLSearchParams(params).toString()}`
}
