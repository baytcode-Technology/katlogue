import multer from 'multer'

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/octet-stream', // common from React Native FormData
])

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])

function isAllowedImage(file: Express.Multer.File): boolean {
  const mime = (file.mimetype || '').toLowerCase()
  if (ALLOWED_MIME.has(mime) || mime.startsWith('image/')) {
    return true
  }
  const name = (file.originalname || '').toLowerCase()
  const dot = name.lastIndexOf('.')
  if (dot === -1) {
    return false
  }
  return ALLOWED_EXT.has(name.slice(dot))
}

const storage = multer.memoryStorage()

export const productImagesUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedImage(file)) {
      cb(new Error('Only JPEG, PNG, WebP, or GIF images are allowed'))
      return
    }
    cb(null, true)
  },
}).array('images', 10)

export const paymentProofUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedImage(file)) {
      cb(new Error('Only JPEG, PNG, WebP, or GIF images are allowed'))
      return
    }
    cb(null, true)
  },
}).single('image')
