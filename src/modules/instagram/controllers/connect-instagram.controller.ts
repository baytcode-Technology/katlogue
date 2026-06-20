import type { Request, Response } from 'express'
import crypto from 'crypto'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { assertPremiumAccess } from '../../../shared/lib/subscription.js'
import { buildInstagramOAuthUrl } from '../services/instagram-oauth.service.js'
import { parseStoreIdFromQuery } from '../../../shared/utils/parse-store-id.js'

function buildState(payload: object): string {
  const json = JSON.stringify(payload)
  return Buffer.from(json, 'utf8').toString('base64url')
}

export const connectInstagram = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

  const storeId = parseStoreIdFromQuery(req.query.store_id ?? req.query.storeId)

  await storeRepository.assertStoreOwner(storeId, req.authUser.id)

  const store = await storeRepository.findStoreById(storeId)
  if (!store) throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')
  assertPremiumAccess(store)

  const nonce = crypto.randomBytes(12).toString('hex')
  const state = buildState({ storeId, nonce })
  const url = buildInstagramOAuthUrl({ state })

  res.status(200).json({
    success: true,
    message: 'Instagram connect URL generated',
    data: { url },
  })
})
