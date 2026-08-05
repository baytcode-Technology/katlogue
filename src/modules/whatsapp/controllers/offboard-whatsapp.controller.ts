import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { parseStoreIdFromBody } from '../../../shared/utils/parse-store-id.js'
import { offboardWhatsAppStore } from '../services/offboard-coexistence.service.js'

/** Disconnect WhatsApp coexistence linkage (Meta unsubscribe + local credential wipe). */
export const offboardWhatsApp = asyncHandler(async (req: Request, res: Response) => {
  if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

  const storeId = parseStoreIdFromBody(req.body?.storeId ?? req.body?.store_id)
  await storeRepository.assertStoreOwner(storeId, req.authUser.id)

  const wabaId =
    typeof req.body?.wabaId === 'string'
      ? req.body.wabaId
      : typeof req.body?.waba_id === 'string'
        ? req.body.waba_id
        : undefined
  const phoneNumberId =
    typeof req.body?.phoneNumberId === 'string'
      ? req.body.phoneNumberId
      : typeof req.body?.phone_number_id === 'string'
        ? req.body.phone_number_id
        : undefined

  const result = await offboardWhatsAppStore({
    storeId,
    wabaId,
    phoneNumberId,
  })

  console.info('[whatsapp][offboard] completed', {
    storeId,
    wabaId: result.wabaId,
    phoneNumberId: result.phoneNumberId,
    metaUnsubscribed: result.metaUnsubscribed,
  })

  res.status(200).json({
    success: true,
    message: 'WhatsApp offboard completed — merchant must disconnect in WhatsApp Business app before reconnecting',
    data: result,
  })
})
