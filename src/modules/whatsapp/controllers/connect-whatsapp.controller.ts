import type { Request, Response } from 'express'
import crypto from 'crypto'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { assertPremiumAccess } from '../../../shared/lib/subscription.js'
import { buildMetaOAuthUrl } from '../services/embedded-signup.service.js'

function buildState(payload: object): string {
  const json = JSON.stringify(payload)
  return Buffer.from(json, 'utf8').toString('base64url')
}

export const connectWhatsApp = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

  const storeId = String(req.query.store_id ?? req.query.storeId ?? '').trim()
  if (!storeId) throw new AppError(400, 'store_id is required', 'VALIDATION_ERROR')

  await storeRepository.assertStoreOwner(storeId, req.authUser.id)

  const store = await storeRepository.findStoreById(storeId)
  if (!store) throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  assertPremiumAccess(store)

  // State: small, signed-in-context and store-scoped
  const nonce = crypto.randomBytes(12).toString('hex')
  const state = buildState({ storeId, nonce })

  const url = buildMetaOAuthUrl({ state })

  res.status(200).json({
    success: true,
    message: 'Meta connect URL generated',
    data: { url },
  })
})

