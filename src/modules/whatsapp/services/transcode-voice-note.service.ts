import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppError } from '../../../shared/errors/app.error.js'

const require = createRequire(import.meta.url)
const ffmpegPath = require('ffmpeg-static') as string | null

function extFromMime(mimeType: string): string {
  const lower = mimeType.toLowerCase()
  if (lower.includes('ogg')) return 'ogg'
  if (lower.includes('amr')) return 'amr'
  if (lower.includes('aac')) return 'aac'
  if (lower.includes('mpeg') || lower.includes('mp3')) return 'mp3'
  if (lower.includes('3gp')) return '3gp'
  return 'm4a'
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error('ffmpeg-static binary is missing'))
      return
    }

    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''

    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    proc.on('error', (err: Error) => reject(err))
    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(stderr.trim() || `ffmpeg exited with code ${String(code)}`))
    })
  })
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

    await runFfmpeg([
      '-y',
      '-i',
      inputPath,
      '-vn',
      '-map',
      '0:a:0',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-c:a',
      'libopus',
      '-b:a',
      '24k',
      '-vbr',
      'on',
      '-compression_level',
      '10',
      '-frame_duration',
      '20',
      '-f',
      'ogg',
      outputPath,
    ])

    const buffer = await readFile(outputPath)
    if (!buffer.length) {
      throw new AppError(500, 'Voice transcode produced an empty file', 'VOICE_TRANSCODE_FAILED')
    }

    if (buffer.subarray(0, 4).toString('ascii') !== 'OggS') {
      throw new AppError(500, 'Voice transcode did not produce a valid OGG file', 'VOICE_TRANSCODE_FAILED')
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
