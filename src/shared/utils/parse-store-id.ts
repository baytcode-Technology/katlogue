import { AppError } from '../errors/app.error.js'

export function parseStoreIdFromQuery(value: unknown): number {
  const raw = String(value ?? '').trim()
  const storeId = Number(raw)
  if (!Number.isFinite(storeId) || storeId <= 0) {
    throw new AppError(400, 'store_id is required', 'VALIDATION_ERROR')
  }
  return storeId
}

export function parseStoreIdFromBody(value: unknown): number {
  return parseStoreIdFromQuery(value)
}
