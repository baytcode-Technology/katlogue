import { env, isVercelConfigured } from '../../../config/env.js'

type VercelDomainResponse = {
  name?: string
  verified?: boolean
  error?: { code?: string; message?: string }
}

function teamQuery(): string {
  return env.VERCEL.TEAM_ID ? `?teamId=${encodeURIComponent(env.VERCEL.TEAM_ID)}` : ''
}

function vercelHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.VERCEL.TOKEN}`,
    'Content-Type': 'application/json',
  }
}

export function storefrontCnameTarget(): string {
  return env.VERCEL.STOREFRONT_CNAME.replace(/\.$/, '').toLowerCase()
}

export async function addVercelProjectDomain(hostname: string): Promise<{ verified: boolean }> {
  if (!isVercelConfigured()) return { verified: false }

  const res = await fetch(
    `https://api.vercel.com/v10/projects/${env.VERCEL.PROJECT_ID}/domains${teamQuery()}`,
    {
      method: 'POST',
      headers: vercelHeaders(),
      body: JSON.stringify({ name: hostname }),
    }
  )
  const body = (await res.json().catch(() => ({}))) as VercelDomainResponse
  if (res.status === 409) {
    return getVercelProjectDomain(hostname)
  }
  if (!res.ok) {
    console.warn('[custom-domain] Vercel add failed', res.status, body)
    return { verified: false }
  }
  return { verified: body.verified === true }
}

export async function getVercelProjectDomain(hostname: string): Promise<{ verified: boolean }> {
  if (!isVercelConfigured()) return { verified: false }

  const res = await fetch(
    `https://api.vercel.com/v9/projects/${env.VERCEL.PROJECT_ID}/domains/${encodeURIComponent(hostname)}${teamQuery()}`,
    { headers: vercelHeaders() }
  )
  if (!res.ok) return { verified: false }
  const body = (await res.json().catch(() => ({}))) as VercelDomainResponse
  return { verified: body.verified === true }
}

export async function removeVercelProjectDomain(hostname: string): Promise<void> {
  if (!isVercelConfigured()) return

  const res = await fetch(
    `https://api.vercel.com/v9/projects/${env.VERCEL.PROJECT_ID}/domains/${encodeURIComponent(hostname)}${teamQuery()}`,
    { method: 'DELETE', headers: vercelHeaders() }
  )
  if (!res.ok && res.status !== 404) {
    console.warn('[custom-domain] Vercel remove failed', res.status, await res.text().catch(() => ''))
  }
}
