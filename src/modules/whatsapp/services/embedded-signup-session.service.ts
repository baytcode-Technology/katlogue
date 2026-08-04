type EmbeddedSignupSessionRecord = {
  wabaId: string
  phoneNumberId: string | null
  createdAt: number
}

const SESSION_TTL_MS = 30 * 60 * 1000
const sessions = new Map<string, EmbeddedSignupSessionRecord>()

function pruneExpiredSessions() {
  const now = Date.now()
  for (const [key, value] of sessions.entries()) {
    if (now - value.createdAt > SESSION_TTL_MS) {
      sessions.delete(key)
    }
  }
}

export function saveEmbeddedSignupSession(input: {
  state: string
  wabaId: string
  phoneNumberId?: string | null
}): void {
  pruneExpiredSessions()
  sessions.set(input.state, {
    wabaId: input.wabaId,
    phoneNumberId: input.phoneNumberId?.trim() || null,
    createdAt: Date.now(),
  })
}

export function consumeEmbeddedSignupSession(state: string): {
  wabaId: string
  phoneNumberId: string | null
} | null {
  pruneExpiredSessions()
  const record = sessions.get(state)
  if (!record) return null
  sessions.delete(state)
  return {
    wabaId: record.wabaId,
    phoneNumberId: record.phoneNumberId,
  }
}
