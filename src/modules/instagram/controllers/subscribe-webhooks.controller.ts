import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'
import { ensureInstagramWebhookSubscription } from '../services/instagram-api.service.js'
import { parseStoreIdFromQuery } from '../../../shared/utils/parse-store-id.js'

export const subscribeInstagramWebhooksHandler = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.authUser) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED')

    const storeId = parseStoreIdFromQuery(req.query.store_id ?? req.query.storeId)

    await storeRepository.assertStoreOwner(storeId, req.authUser.id)

    const store = await storeRepository.findStoreById(storeId)
    if (!store?.ig_user_id || !store.ig_access_token) {
      throw new AppError(400, 'Instagram is not connected for this store', 'INSTAGRAM_NOT_CONNECTED')
    }

    await ensureInstagramWebhookSubscription(store)

    res.status(200).json({
      success: true,
      message: 'Instagram message webhooks subscribed for this account',
      data: {
        ig_user_id: store.ig_user_id,
        ig_username: store.ig_username,
      },
    })
  }
)
