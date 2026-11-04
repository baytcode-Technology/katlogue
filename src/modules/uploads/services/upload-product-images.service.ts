import { randomUUID } from 'crypto'
import { supabaseAdmin } from '../../../config/supabase.js'
import { env } from '../../../config/env.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'

async function ensureStorageBucket(bucket: string): Promise<void> {
  const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets()
  if (listError) {
    throw new AppError(500, listError.message, 'STORAGE_LIST_FAILED')
  }
  if (buckets?.some((b) => b.name === bucket)) {
    return
  }

  const { error: createError } = await supabaseAdmin.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  })

  if (createError) {
    const exists =
      createError.message.toLowerCase().includes('already exists') ||
      createError.message.toLowerCase().includes('duplicate')
    if (!exists) {
      throw new AppError(
        500,
        `Storage bucket "${bucket}" is missing. In Supabase: Storage → New bucket → name "${bucket}" → Public. Or set SUPABASE_STORAGE_BUCKET on Railway.`,
        'BUCKET_NOT_FOUND'
      )
    }
  }
}

function extensionFromMime(mime: string): string {
  switch (mime) {
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    default:
      return 'jpg'
  }
}

const MAX_LONG_EDGE_PX = 1600

/**
 * Auto-rotates from EXIF and caps the long edge. Never crops: aspect ratio is
 * preserved so storefronts can show the full photo. Falls back to the original
 * bytes if processing fails or the format is animated/unsupported.
 */
async function normalizeProductImage(file: {
  buffer: Buffer
  mimetype: string
}): Promise<{ buffer: Buffer; mimetype: string }> {
  if (file.mimetype === 'image/gif') return file

  try {
    const { default: sharp } = await import('sharp')
    const pipeline = sharp(file.buffer).rotate().resize({
      width: MAX_LONG_EDGE_PX,
      height: MAX_LONG_EDGE_PX,
      fit: 'inside',
      withoutEnlargement: true,
    })

    if (file.mimetype === 'image/png') {
      return { buffer: await pipeline.png().toBuffer(), mimetype: 'image/png' }
    }
    if (file.mimetype === 'image/webp') {
      return { buffer: await pipeline.webp({ quality: 88 }).toBuffer(), mimetype: 'image/webp' }
    }
    return { buffer: await pipeline.jpeg({ quality: 88 }).toBuffer(), mimetype: 'image/jpeg' }
  } catch {
    return file
  }
}

export async function uploadProductImages(
  ownerId: string,
  storeId: number,
  files: { buffer: Buffer; mimetype: string }[]
): Promise<string[]> {
  if (!files.length) {
    throw new AppError(400, 'At least one image file is required', 'NO_FILES')
  }

  await storeRepository.assertStoreMember(storeId, ownerId)

  const bucket = env.SUPABASE_STORAGE_BUCKET
  await ensureStorageBucket(bucket)

  const urls: string[] = []

  for (const original of files) {
    const file = await normalizeProductImage(original)
    const ext = extensionFromMime(file.mimetype)
    const path = `${storeId}/${randomUUID()}.${ext}`

    const { error } = await supabaseAdmin.storage.from(bucket).upload(path, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    })

    if (error) {
      const msg = error.message.toLowerCase().includes('not found')
        ? `Storage bucket "${bucket}" not found. Create a public bucket named "${bucket}" in Supabase Storage.`
        : error.message
      throw new AppError(400, msg, 'UPLOAD_FAILED')
    }

    const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(path)
    urls.push(data.publicUrl)
  }

  return urls
}
