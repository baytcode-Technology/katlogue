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

import { embeddedSignupPage } from '../controllers/embedded-signup-page.controller.js'

import { embeddedSignupEvent } from '../controllers/embedded-signup-event.controller.js'

import { offboardWhatsApp } from '../controllers/offboard-whatsapp.controller.js'

import { connectionStatus } from '../controllers/connection-status.controller.js'

import { triggerSync } from '../controllers/trigger-sync.controller.js'

import { getWhatsAppMedia } from '../controllers/get-whatsapp-media.controller.js'

import { uploadWhatsAppMedia } from '../controllers/upload-whatsapp-media.controller.js'

import { sendMedia } from '../controllers/send-media.controller.js'

import { forwardMessage } from '../controllers/forward-message.controller.js'
import { createSetReplyModeController } from '../../inbox-ai/controllers/set-reply-mode.controller.js'
import {
  setReplyModeParamsSchema,
  setReplyModeQuerySchema,
  setReplyModeSchema,
} from '../../inbox-ai/validations/inbox-ai.validation.js'



import { sendTemplateSchema } from '../validations/send-template.validation.js'

import { sendMessageSchema } from '../validations/send-message.validation.js'

import { triggerSyncSchema } from '../validations/trigger-sync.validation.js'

import { completeOnboardingSchema } from '../validations/complete-onboarding.validation.js'

import { offboardWhatsAppSchema } from '../validations/offboard-whatsapp.validation.js'

import { sendMediaSchema, forwardMessageSchema } from '../validations/send-media.validation.js'

import { whatsAppMediaUpload } from '../../../shared/middleware/upload.middleware.js'

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

router.get('/embedded-signup', embeddedSignupPage)

router.post('/embedded-signup/event', embeddedSignupEvent)

router.post(

  '/offboard',

  requireAuth,

  validateBody(offboardWhatsAppSchema),

  offboardWhatsApp

)

router.get('/connection-status', requireAuth, connectionStatus)

router.get('/media/:mediaId', requireAuth, validateQuery(listChatsQuerySchema), getWhatsAppMedia)

router.post(
  '/media/upload',
  requireAuth,
  validateQuery(listChatsQuerySchema),
  whatsAppMediaUpload,
  uploadWhatsAppMedia
)

router.post('/sync', requireAuth, validateBody(triggerSyncSchema), triggerSync)



router.post('/send', requireAuth, validateBody(sendMessageSchema), sendMessage)

router.post('/send-media', requireAuth, validateBody(sendMediaSchema), sendMedia)

router.post('/forward', requireAuth, validateBody(forwardMessageSchema), forwardMessage)

router.post(
  '/chats/:conversationId/reply-mode',
  requireAuth,
  validateParams(setReplyModeParamsSchema),
  validateQuery(setReplyModeQuerySchema),
  validateBody(setReplyModeSchema),
  createSetReplyModeController('whatsapp')
)

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

