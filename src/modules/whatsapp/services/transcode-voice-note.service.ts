import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpeg from 'fluent-ffmpeg'
import { AppError } from '../../../shared/errors/app.error.js'

const require = createRequire(import.meta.url)
const ffmpegPath = require('ffmpeg-static') as string | null

if (!ffmpegPath) {
  throw new Error('ffmpeg-static binary is missing')
}

ffmpeg.setFfmpegPath(ffmpegPath)

function extFromMime(mimeType: string): string {
  const lower = mimeType.toLowerCase()
  if (lower.includes('ogg')) return 'ogg'
  if (lower.includes('amr')) return 'amr'
  if (lower.includes('aac')) return 'aac'
  if (lower.includes('mpeg') || lower.includes('mp3')) return 'mp3'
  if (lower.includes('3gp')) return '3gp'
  return 'm4a'
}

export async function transcodeVoiceNoteToOgg(input: {
  buffer: Buffer
  mimeType: string
}): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
  const workDir = await mkdtemp(join(tmpdir(), 'wa-voice-'))
  const inputExt = extFromMime(input.mimeType)
  const inputPath = join(workDir, `input.${inputExt}`)
  const outputPath = join(workDir, 'voice.ogg')

  try {
    await writeFile(inputPath, input.buffer)

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .audioChannels(1)
        .audioCodec('libopus')
        .audioBitrate('32k')
        .format('ogg')
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .save(outputPath)
    })

    const buffer = await readFile(outputPath)
    if (!buffer.length) {
      throw new AppError(500, 'Voice transcode produced an empty file', 'VOICE_TRANSCODE_FAILED')
    }

    return {
      buffer,
      filename: `voice-${Date.now()}.ogg`,
      mimeType: 'audio/ogg',
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Voice transcode failed'
    throw new AppError(500, message, 'VOICE_TRANSCODE_FAILED')
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
  }
}
