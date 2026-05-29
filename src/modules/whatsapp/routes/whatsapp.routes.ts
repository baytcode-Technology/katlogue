import { Router } from 'express'
import { requireAuth } from '../../../shared/middleware/auth.middleware.js'
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../../shared/middleware/validate.middleware.js'
import { sendTemplate } from '../controllers/send-template.controller.js'
import { listChats } from '../controllers/list-chats.controller.js'
import { listChatMessages } from '../controllers/list-messages.controller.js'
import { sendTemplateSchema } from '../validations/send-template.validation.js'
import {
  listChatsQuerySchema,
  listMessagesParamsSchema,
  listMessagesQuerySchema,
} from '../validations/chats.validation.js'

const router = Router()

router.post('/send-template', requireAuth, validateBody(sendTemplateSchema), sendTemplate)
router.get('/chats', requireAuth, validateQuery(listChatsQuerySchema), listChats)
router.get(
  '/chats/:conversationId/messages',
  requireAuth,
  validateParams(listMessagesParamsSchema),
  validateQuery(listMessagesQuerySchema),
  listChatMessages
)

export default router

