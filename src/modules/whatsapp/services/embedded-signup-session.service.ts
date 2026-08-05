import { AppError } from '../../../shared/errors/app.error.js'

export type EmbeddedSignupSessionEvent = {
  type: string
  event: string | null
  data: unknown
  at: number
}

export type EmbeddedSignupSession = {
  storeId: number
  nonce: string
  createdAt: number
  events: EmbeddedSignupSessionEvent[]
  wabaId: string | null
  phoneNumberId: string | null
  onboardingComplete: boolean
  verifyOtpSeen: boolean
  cancelled: boolean
  errored: boolean
}

const sessions = new Map<string, EmbeddedSignupSession>()
const SESSION_TTL_MS = 60 * 60 * 1000

export function parseEmbeddedSignupState(state: string): { storeId: number; nonce: string } | null {
  try {
    const json = Buffer.from(state, 'base64url').toString('utf8')
    const parsed = JSON.parse(json) as { storeId?: number; nonce?: string }
    if (typeof parsed.storeId !== 'number' || typeof parsed.nonce !== 'string' || !parsed.nonce) {
      return null
    }
    return { storeId: parsed.storeId, nonce: parsed.nonce }
  } catch {
    return null
  }
}

function pruneExpiredSessions(): void {
  const cutoff = Date.now() - SESSION_TTL_MS
  for (const [key, session] of sessions) {
    if (session.createdAt < cutoff) sessions.delete(key)
  }
}

export function ensureEmbeddedSignupSession(state: string, storeId: number, nonce: string): void {
  pruneExpiredSessions()
  if (!sessions.has(state)) {
    sessions.set(state, {
      storeId,
      nonce,
      createdAt: Date.now(),
      events: [],
      wabaId: null,
      phoneNumberId: null,
      onboardingComplete: false,
      verifyOtpSeen: false,
      cancelled: false,
      errored: false,
    })
  }
}

export function recordEmbeddedSignupEvent(input: {
  state: string
  payload: unknown
}): EmbeddedSignupSession {
  const parsed = parseEmbeddedSignupState(input.state)
  if (!parsed) {
    throw new AppError(400, 'Invalid embedded signup state', 'ES_INVALID_STATE')
  }

  pruneExpiredSessions()

  let session = sessions.get(input.state)
  if (!session) {
    session = {
      storeId: parsed.storeId,
      nonce: parsed.nonce,
      createdAt: Date.now(),
      events: [],
      wabaId: null,
      phoneNumberId: null,
      onboardingComplete: false,
      verifyOtpSeen: false,
      cancelled: false,
      errored: false,
    }
    sessions.set(input.state, session)
  }

  const raw = input.payload as Record<string, unknown>
  const type = typeof raw.type === 'string' ? raw.type : 'unknown'
  const event = typeof raw.event === 'string' ? raw.event : null
  const data = raw.data ?? raw

  session.events.push({
    type,
    event,
    data,
    at: Date.now(),
  })

  if (type === 'WA_EMBEDDED_SIGNUP') {
    const dataObj = data as Record<string, unknown>
    const wabaFromData =
      typeof dataObj.waba_id === 'string'
        ? dataObj.waba_id
        : typeof dataObj.wabaId === 'string'
          ? dataObj.wabaId
          : null
    const phoneFromData =
      typeof dataObj.phone_number_id === 'string'
        ? dataObj.phone_number_id
        : typeof dataObj.phoneNumberId === 'string'
          ? dataObj.phoneNumberId
          : null

    if (wabaFromData) session.wabaId = wabaFromData
    if (phoneFromData) session.phoneNumberId = phoneFromData

    if (event === 'VERIFY_OTP') session.verifyOtpSeen = true
    if (event === 'CANCEL') session.cancelled = true
    if (event === 'ERROR') session.errored = true

    if (
      event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' ||
      event === 'ONBOARDING_COMPLETE' ||
      (event === 'FINISH' && Boolean(wabaFromData || phoneFromData))
    ) {
      session.onboardingComplete = true
    }
  }

  console.info('[whatsapp][embedded-signup] session event', {
    storeId: session.storeId,
    event,
    type,
    verifyOtpSeen: session.verifyOtpSeen,
    onboardingComplete: session.onboardingComplete,
    wabaId: session.wabaId,
    phoneNumberId: session.phoneNumberId,
  })

  return session
}

export function getEmbeddedSignupSession(state: string | null | undefined): EmbeddedSignupSession | null {
  if (!state) return null
  pruneExpiredSessions()
  return sessions.get(state) ?? null
}
