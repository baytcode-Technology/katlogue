import { Router } from 'express'
import { requireAuth } from '../../../shared/middleware/auth.middleware.js'
import { productImagesUpload } from '../../../shared/middleware/upload.middleware.js'
import { uploadProductImages } from '../controllers/upload-product-images.controller.js'

const router = Router()

router.post(
  '/product-images',
  requireAuth,
  productImagesUpload,
  uploadProductImages
)

export default router
