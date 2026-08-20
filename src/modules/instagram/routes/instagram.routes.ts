import { Router } from 'express'
import { requireAuth } from '../../../shared/middleware/auth.middleware.js'
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../../shared/middleware/validate.middleware.js'
import { connectInstagram } from '../controllers/connect-instagram.controller.js'
import { instagramOAuthCallback } from '../controllers/oauth-callback.controller.js'
import { instagramConnectionStatus } from '../controllers/connection-status.controller.js'
import { listInstagramChats } from '../controllers/list-chats.controller.js'
import { listInstagramChatMessages } from '../controllers/list-messages.controller.js'
import { markInstagramChatRead } from '../controllers/mark-chat-read.controller.js'
import { sendInstagramMessage } from '../controllers/send-message.controller.js'
import { uploadInstagramMedia } from '../controllers/upload-instagram-media.controller.js'
import { sendInstagramMedia } from '../controllers/send-instagram-media.controller.js'
import { forwardInstagramMessageHandler } from '../controllers/forward-instagram-message.controller.js'
import { createSetReplyModeController } from '../../inbox-ai/controllers/set-reply-mode.controller.js'
import {
  setReplyModeParamsSchema,
  setReplyModeQuerySchema,
  setReplyModeSchema,
} from '../../inbox-ai/validations/inbox-ai.validation.js'
import { subscribeInstagramWebhooksHandler } from '../controllers/subscribe-webhooks.controller.js'
import { sendMessageSchema } from '../validations/send-message.validation.js'
import {
  forwardInstagramMessageSchema,
  sendInstagramMediaSchema,
} from '../validations/send-media.validation.js'
import {
  listChatsQuerySchema,
  listMessagesParamsSchema,
  listMessagesQuerySchema,
} from '../validations/chats.validation.js'
import { instagramMediaUpload } from '../../../shared/middleware/upload.middleware.js'

const router = Router()

router.get('/connect', requireAuth, connectInstagram)
router.get('/oauth/callback', instagramOAuthCallback)
router.get('/connection-status', requireAuth, instagramConnectionStatus)
router.post('/subscribe-webhooks', requireAuth, subscribeInstagramWebhooksHandler)

router.post('/send', requireAuth, validateBody(sendMessageSchema), sendInstagramMessage)
router.post(
  '/media/upload',
  requireAuth,
  validateQuery(listChatsQuerySchema),
  instagramMediaUpload,
  uploadInstagramMedia
)
router.post(
  '/send-media',
  requireAuth,
  validateBody(sendInstagramMediaSchema),
  sendInstagramMedia
)
router.post(
  '/forward',
  requireAuth,
  validateBody(forwardInstagramMessageSchema),
  forwardInstagramMessageHandler
)
router.post(
  '/chats/:conversationId/reply-mode',
  requireAuth,
  validateParams(setReplyModeParamsSchema),
  validateQuery(setReplyModeQuerySchema),
  validateBody(setReplyModeSchema),
  createSetReplyModeController('instagram')
)
router.get('/chats', requireAuth, validateQuery(listChatsQuerySchema), listInstagramChats)
router.post(
  '/chats/:conversationId/mark-read',
  requireAuth,
  validateParams(listMessagesParamsSchema),
  validateQuery(listChatsQuerySchema),
  markInstagramChatRead
)
router.get(
  '/chats/:conversationId/messages',
  requireAuth,
  validateParams(listMessagesParamsSchema),
  validateQuery(listMessagesQuerySchema),
  listInstagramChatMessages
)

export default router
