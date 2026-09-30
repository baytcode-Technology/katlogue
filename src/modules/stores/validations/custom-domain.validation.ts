import { z } from 'zod'

export const setCustomDomainSchema = z.object({
  domain: z.string().trim().min(3, 'Domain is required').max(253),
})

export type SetCustomDomainBody = z.infer<typeof setCustomDomainSchema>
