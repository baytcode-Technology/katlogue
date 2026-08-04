import { Router } from 'express'

import { requireAuth } from '../../../shared/middleware/auth.middleware.js'

import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../../shared/middleware/validate.middleware.js'

import { sendTemplate } from '../controllers/send-template.controller.js'
import { sendMessage } from '../controllers/send-message.controller.js'
import { listChats } from '../controllers/list-chats.controller.js'
import { listChatMessages } from '../controllers/list-messages.controller.js'
import { markChatRead } from '../controllers/mark-chat-read.controller.js'
import { connectWhatsApp } from '../controllers/connect-whatsapp.controller.js'
import { completeOnboarding } from '../controllers/complete-onboarding.controller.js'
import { metaOAuthCallback } from '../controllers/oauth-callback.controller.js'
import { metaOAuthLaunch } from '../controllers/oauth-launch.controller.js'
import { connectionStatus } from '../controllers/connection-status.controller.js'
import { triggerSync } from '../controllers/trigger-sync.controller.js'
import { whatsappSyncDiagnostics } from '../controllers/sync-diagnostics.controller.js'
import { whatsappDebugSession } from '../controllers/debug-session.controller.js'

import { sendTemplateSchema } from '../validations/send-template.validation.js'
import { sendMessageSchema } from '../validations/send-message.validation.js'
import { triggerSyncSchema } from '../validations/trigger-sync.validation.js'
import { completeOnboardingSchema } from '../validations/complete-onboarding.validation.js'
import {
  listChatsQuerySchema,
  listMessagesParamsSchema,
  listMessagesQuerySchema,
} from '../validations/chats.validation.js'

const router = Router()

router.get('/connect', requireAuth, connectWhatsApp)
router.post(
  '/complete-onboarding',
  requireAuth,
  validateBody(completeOnboardingSchema),
  completeOnboarding
)
router.get('/oauth/launch', metaOAuthLaunch)
router.get('/oauth/callback', metaOAuthCallback)
router.post('/debug-session', requireAuth, whatsappDebugSession)
router.get('/connection-status', requireAuth, connectionStatus)
router.get('/sync-diagnostics', requireAuth, whatsappSyncDiagnostics)
router.post('/sync', requireAuth, validateBody(triggerSyncSchema), triggerSync)

router.post('/send', requireAuth, validateBody(sendMessageSchema), sendMessage)
router.post('/send-template', requireAuth, validateBody(sendTemplateSchema), sendTemplate)
router.get('/chats', requireAuth, validateQuery(listChatsQuerySchema), listChats)
router.post(
  '/chats/:conversationId/mark-read',
  requireAuth,
  validateParams(listMessagesParamsSchema),
  validateQuery(listChatsQuerySchema),
  markChatRead
)
router.get(
  '/chats/:conversationId/messages',
  requireAuth,
  validateParams(listMessagesParamsSchema),
  validateQuery(listMessagesQuerySchema),
  listChatMessages
)

export default router
