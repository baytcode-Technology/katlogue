import multer from 'multer'

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

const storage = multer.memoryStorage()

export const productImagesUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error('Only JPEG, PNG, WebP, or GIF images are allowed'))
      return
    }
    cb(null, true)
  },
}).array('images', 10)
