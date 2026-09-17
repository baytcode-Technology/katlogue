import { z } from 'zod'

const emptyToUndefined = (value: unknown) =>
  value === '' || value === undefined || value === null ? undefined : value

export const listPlatformAdminUsersQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
  hasStore: z.preprocess(emptyToUndefined, z.enum(['yes', 'no']).optional()),
  plan: z.preprocess(
    emptyToUndefined,
    z.enum(['free', 'starter', 'business', 'enterprise']).optional()
  ),
  signedAfter: z.preprocess(emptyToUndefined, z.enum(['7d', '30d', '90d']).optional()),
  sort: z.preprocess(emptyToUndefined, z.enum(['recent']).optional()).transform((v) => v ?? 'recent'),
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()).transform(
    (v) => v ?? 1
  ),
  limit: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(50).optional()
  ).transform((v) => v ?? 20),
})

export const platformAdminUserParamsSchema = z.object({
  userId: z.string().uuid('Invalid user id'),
})

export type ListPlatformAdminUsersQueryInput = z.infer<typeof listPlatformAdminUsersQuerySchema>
export type PlatformAdminUserParams = z.infer<typeof platformAdminUserParamsSchema>
