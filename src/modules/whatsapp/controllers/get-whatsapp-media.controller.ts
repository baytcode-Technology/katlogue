import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { parseStoreIdFromQuery } from '../../../shared/utils/parse-store-id.js'
import { downloadWhatsAppMedia } from '../services/whatsapp-media.service.js'

/** Stream WhatsApp media (image/video/audio/document/sticker) via Meta Graph API. */
export const getWhatsAppMedia = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

  const storeId = parseStoreIdFromQuery(req.query.store_id ?? req.query.storeId)
  await storeRepository.assertStoreMember(storeId, req.authUser.id)

  const mediaId = String(req.params.mediaId ?? '').trim()
  if (!mediaId) {
    throw new AppError(400, 'mediaId is required', 'WHATSAPP_MEDIA_ID_REQUIRED')
  }

  const { buffer, mimeType } = await downloadWhatsAppMedia({ storeId, mediaId })

  res
    .status(200)
    .set('Content-Type', mimeType)
    .set('Cache-Control', 'private, max-age=3600')
    .send(buffer)
})
