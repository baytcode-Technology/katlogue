import { z } from 'zod'

export const setCustomDomainSchema = z.object({
  domain: z.string().trim().min(3, 'Domain is required').max(253),
})

export const setPublicLinkHostSchema = z.object({
  public_link_host: z.enum(['custom', 'subdomain']),
})

export type SetCustomDomainBody = z.infer<typeof setCustomDomainSchema>
export type SetPublicLinkHostBody = z.infer<typeof setPublicLinkHostSchema>
