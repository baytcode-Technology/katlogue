import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppError } from '../../../shared/errors/app.error.js'

const require = createRequire(import.meta.url)
const ffmpegPath = require('ffmpeg-static') as string | null

function extFromMimeOrName(mimeType: string, filename: string): string {
  const lower = `${mimeType} ${filename}`.toLowerCase()
  if (lower.includes('quicktime') || lower.endsWith('.mov')) return 'mov'
  if (lower.includes('3gp')) return '3gp'
  return 'mp4'
}

function needsMp4Transcode(mimeType: string, filename: string): boolean {
  const lower = `${mimeType} ${filename}`.toLowerCase()
  return lower.includes('quicktime') || lower.endsWith('.mov')
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

export async function transcodeVideoToMp4(input: {
  buffer: Buffer
  mimeType: string
  filename: string
}): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
  if (!needsMp4Transcode(input.mimeType, input.filename)) {
    return {
      buffer: input.buffer,
      filename: input.filename,
      mimeType: input.mimeType,
    }
  }

  const workDir = await mkdtemp(join(tmpdir(), 'wa-video-'))
  const inputExt = extFromMimeOrName(input.mimeType, input.filename)
  const inputPath = join(workDir, `input.${inputExt}`)
  const outputPath = join(workDir, 'output.mp4')

  try {
    await writeFile(inputPath, input.buffer)

    await runFfmpeg([
      '-y',
      '-i',
      inputPath,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '28',
      '-c:a',
      'aac',
      '-movflags',
      '+faststart',
      '-f',
      'mp4',
      outputPath,
    ])

    const buffer = await readFile(outputPath)
    if (!buffer.length) {
      throw new AppError(500, 'Video transcode produced an empty file', 'VIDEO_TRANSCODE_FAILED')
    }

    return {
      buffer,
      filename: input.filename.replace(/\.[^./\\]+$/, '') + '.mp4',
      mimeType: 'video/mp4',
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Video transcode failed'
    throw new AppError(500, message, 'VIDEO_TRANSCODE_FAILED')
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
  }
}
