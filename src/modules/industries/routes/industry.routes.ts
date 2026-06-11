import { Router } from 'express'
import { listIndustries } from '../controllers/list-industries.controller.js'
import { requireAuth } from '../../../shared/middleware/auth.middleware.js'

const router = Router()

router.get('/', requireAuth, listIndustries)

export default router
