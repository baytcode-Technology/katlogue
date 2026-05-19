import { randomUUID } from 'crypto'
import { supabaseAdmin } from '../../../config/supabase.js'
import { env } from '../../../config/env.js'
import { AppError } from '../../../shared/errors/app.error.js'
import * as storeRepository from '../../stores/repositories/store.repository.js'

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

export async function uploadProductImages(
  ownerId: string,
  storeId: string,
  files: { buffer: Buffer; mimetype: string }[]
): Promise<string[]> {
  if (!files.length) {
    throw new AppError(400, 'At least one image file is required', 'NO_FILES')
  }

  await storeRepository.assertStoreOwner(storeId, ownerId)

  const bucket = env.SUPABASE_STORAGE_BUCKET
  const urls: string[] = []

  for (const file of files) {
    const ext = extensionFromMime(file.mimetype)
    const path = `${storeId}/${randomUUID()}.${ext}`

    const { error } = await supabaseAdmin.storage.from(bucket).upload(path, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    })

    if (error) {
      throw new AppError(400, error.message, 'UPLOAD_FAILED')
    }

    const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(path)
    urls.push(data.publicUrl)
  }

  return urls
}
