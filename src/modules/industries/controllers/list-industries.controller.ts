import type { Request, Response } from 'express'
import { asyncHandler } from '../../../shared/helpers/async-handler.js'
import * as listIndustriesService from '../services/list-industries.service.js'

export const listIndustries = asyncHandler(async (_req: Request, res: Response) => {
  const industries = await listIndustriesService.listIndustryGroups()

  res.status(200).json({
    success: true,
    message: 'Industries fetched successfully',
    data: {
      industries,
      count: industries.length,
    },
  })
})
