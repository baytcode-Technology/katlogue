import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import { parseStoreIdFromQuery } from '../../../shared/utils/parse-store-id.js'
import { uploadWhatsAppMediaToMeta } from '../services/upload-whatsapp-media.service.js'
import type { WhatsAppMediaKind } from '../services/upload-whatsapp-media.service.js'

export const uploadWhatsAppMedia = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

  const storeId = parseStoreIdFromQuery(req.query.store_id ?? req.query.storeId)
  const kindRaw = String(req.query.kind ?? req.body?.kind ?? 'image').trim().toLowerCase()
  const kind = (['image', 'audio', 'video'].includes(kindRaw) ? kindRaw : 'image') as WhatsAppMediaKind

  const file = req.file
  if (!file?.buffer?.length) {
    throw new AppError(400, 'Multipart field "file" is required', 'NO_FILE')
  }

  const voiceRaw = req.query.voice ?? req.body?.voice
  const voice =
    voiceRaw === true ||
    voiceRaw === 'true' ||
    voiceRaw === '1' ||
    voiceRaw === 1

  const result = await uploadWhatsAppMediaToMeta({
    storeId,
    ownerId: req.authUser.id,
    kind,
    buffer: file.buffer,
    mimeType: file.mimetype || 'application/octet-stream',
    filename: file.originalname || `${kind}.bin`,
    voice: kind === 'audio' ? voice : false,
  })

  res.status(201).json({
    success: true,
    message: 'Media uploaded successfully',
    data: {
      store_id: storeId,
      media_id: result.mediaId,
      mime_type: result.mimeType,
    },
  })
})
