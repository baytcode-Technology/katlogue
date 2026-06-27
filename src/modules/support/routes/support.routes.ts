import { Router } from 'express';
import { requireAuth } from '../../../shared/middleware/auth.middleware.js';
import { requireInternalSecret } from '../../../shared/middleware/internal-secret.middleware.js';
import { requirePlatformAdmin } from '../../../shared/middleware/platform-admin.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../../shared/middleware/validate.middleware.js';
import {
  adminSendMessage,
} from '../controllers/admin-send-message.controller.js';
import { closeConversation } from '../controllers/close-conversation.controller.js';
import { listAdminConversations } from '../controllers/admin-list-conversations.controller.js';
import { listAdminMessages } from '../controllers/admin-list-messages.controller.js';
import { cleanupExpired } from '../controllers/cleanup-expired.controller.js';
import { escalateConversation } from '../controllers/escalate-conversation.controller.js';
import {
  checkPlatformAdmin,
  getOrCreateConversation,
} from '../controllers/get-or-create-conversation.controller.js';
import { listMessages } from '../controllers/list-messages.controller.js';
import { sendMessage } from '../controllers/send-message.controller.js';
import { setReplyMode } from '../controllers/set-reply-mode.controller.js';
import {
  adminSendMessageSchema,
  sendSupportMessageSchema,
  setReplyModeSchema,
  supportConversationParamsSchema,
  supportStoreQuerySchema,
} from '../validations/support.validation.js';

const router = Router();

router.get(
  '/conversation',
  validateQuery(supportStoreQuerySchema),
  requireAuth,
  getOrCreateConversation
);

router.get(
  '/conversations/:id/messages',
  validateParams(supportConversationParamsSchema),
  validateQuery(supportStoreQuerySchema),
  requireAuth,
  listMessages
);

router.post(
  '/conversations/:id/messages',
  validateParams(supportConversationParamsSchema),
  validateQuery(supportStoreQuerySchema),
  validateBody(sendSupportMessageSchema),
  requireAuth,
  sendMessage
);

router.post(
  '/conversations/:id/escalate',
  validateParams(supportConversationParamsSchema),
  validateQuery(supportStoreQuerySchema),
  requireAuth,
  escalateConversation
);

router.get('/admin/me', requireAuth, checkPlatformAdmin);

router.get('/admin/conversations', requireAuth, requirePlatformAdmin, listAdminConversations);

router.get(
  '/admin/conversations/:id/messages',
  validateParams(supportConversationParamsSchema),
  requireAuth,
  requirePlatformAdmin,
  listAdminMessages
);

router.post(
  '/admin/conversations/:id/messages',
  validateParams(supportConversationParamsSchema),
  validateBody(adminSendMessageSchema),
  requireAuth,
  requirePlatformAdmin,
  adminSendMessage
);

router.patch(
  '/admin/conversations/:id/reply-mode',
  validateParams(supportConversationParamsSchema),
  validateBody(setReplyModeSchema),
  requireAuth,
  requirePlatformAdmin,
  setReplyMode
);

router.post(
  '/admin/conversations/:id/close',
  validateParams(supportConversationParamsSchema),
  requireAuth,
  requirePlatformAdmin,
  closeConversation
);

router.post('/internal/cleanup', requireInternalSecret, cleanupExpired);

export default router;
