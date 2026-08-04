import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { runFullCoexistenceSync, triggerSmbAppDataSync } from '../services/coexistence-sync.service.js'
import { parseStoreIdFromBody } from '../../../shared/utils/parse-store-id.js'
import { resolveStoreWhatsAppCredentials } from '../services/whatsapp.service.js'

export const triggerSync = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

  const storeId = parseStoreIdFromBody(req.body?.storeId ?? req.body?.store_id)

  await storeRepository.assertStoreOwner(storeId, req.authUser.id)

  const store = await storeRepository.findStoreById(storeId)
  if (!store) throw new AppError(404, 'Store not found', 'STORE_NOT_FOUND')

  const credentials = resolveStoreWhatsAppCredentials(store)
  if (!credentials) {
    throw new AppError(503, 'WhatsApp is not connected for this store', 'WHATSAPP_NOT_CONNECTED')
  }

  const syncType =
    req.body?.syncType === 'history' || req.body?.sync_type === 'history'
      ? 'history'
      : req.body?.syncType === 'contacts' || req.body?.sync_type === 'contacts'
        ? 'smb_app_state_sync'
        : null

  if (syncType) {
    const result = await triggerSmbAppDataSync({
      storeId,
      syncType,
      credentials,
    })
    res.status(200).json({
      success: true,
      message: 'Sync triggered successfully',
      data: result,
    })
    return
  }

  const result = await runFullCoexistenceSync({
    storeId,
    credentials,
    initialDelayMs: 3_000,
    wabaId: store.wa_waba_id,
  })

  res.status(200).json({
    success: true,
    message: 'Sync triggered successfully',
    data: result,
  })
})
