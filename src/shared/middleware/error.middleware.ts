import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'
import { AppError } from '../errors/app.error.js'

function multerErrorMessage(err: multer.MulterError): string {
  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      return 'Each image must be 5MB or smaller'
    case 'LIMIT_FILE_COUNT':
      return 'Maximum 10 images per upload'
    case 'LIMIT_UNEXPECTED_FILE':
      return 'Use field name "images" for file uploads'
    default:
      return err.message
  }
}

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        code: err.code,
      },
    })
  }

  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      error: {
        message: multerErrorMessage(err),
        code: err.code,
      },
    })
  }

  if (err instanceof Error && err.message) {
    const uploadHints = ['Only JPEG', 'Unexpected field', 'images']
    if (uploadHints.some((hint) => err.message.includes(hint))) {
      return res.status(400).json({
        success: false,
        error: {
          message: err.message,
          code: 'UPLOAD_ERROR',
        },
      })
    }
  }

  console.error(err)
  return res.status(500).json({
    success: false,
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
    },
  })
}
