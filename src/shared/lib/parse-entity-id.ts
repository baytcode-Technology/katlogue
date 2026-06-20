const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseEntityId(value: unknown, label = 'id'): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value
  }

  const raw = String(value ?? '').trim()

  if (/^\d+$/.test(raw)) {
    const parsed = Number(raw)
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed
    }
  }

  if (UUID_RE.test(raw)) {
    throw new Error(
      `${label} is still a UUID. Apply supabase migration 028_integer_ids.sql on your database, then create a new store.`
    )
  }

  throw new Error(`Invalid ${label}: expected a positive integer`)
}

export function tryParseEntityId(value: unknown): number | null {
  try {
    return parseEntityId(value)
  } catch {
    return null
  }
}
