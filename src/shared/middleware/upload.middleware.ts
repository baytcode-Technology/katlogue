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
}).array('images', 15)

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

const WHATSAPP_MEDIA_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/amr',
  'video/mp4',
  'video/3gpp',
  'application/octet-stream',
])

function isAllowedWhatsAppMedia(file: Express.Multer.File): boolean {
  const mime = (file.mimetype || '').toLowerCase()
  if (WHATSAPP_MEDIA_MIME.has(mime) || mime.startsWith('image/') || mime.startsWith('audio/') || mime.startsWith('video/')) {
    return true
  }
  const name = (file.originalname || '').toLowerCase()
  return /\.(jpe?g|png|webp|mp4|3gp|ogg|mp3|m4a|aac|amr)$/.test(name)
}

export const whatsAppMediaUpload = multer({
  storage,
  limits: { fileSize: 16 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedWhatsAppMedia(file)) {
      cb(new Error('Unsupported media type for WhatsApp upload'))
      return
    }
    cb(null, true)
  },
}).single('file')
