import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import { env } from '../../config/env.js'
import { AppError } from '../errors/app.error.js'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16
const SALT = 'aishopy-payment-v1'

function deriveKey(): Buffer {
  const secret = env.PAYMENT_ENCRYPTION_KEY
  if (!secret) {
    throw new AppError(
      500,
      'Payment encryption is not configured on the server',
      'PAYMENT_ENCRYPTION_NOT_CONFIGURED'
    )
  }
  return scryptSync(secret, SALT, 32)
}

export function encryptPaymentSecret(plain: string): string {
  const key = deriveKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64url')
}

export function decryptPaymentSecret(encoded: string): string {
  const key = deriveKey()
  const buf = Buffer.from(encoded, 'base64url')
  const iv = buf.subarray(0, IV_LENGTH)
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

export function maskSecret(value: string | undefined): string | null {
  if (!value) return null
  if (value.length <= 4) return '••••'
  return `••••${value.slice(-4)}`
}
