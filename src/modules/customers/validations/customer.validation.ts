import { z } from 'zod'

export const listCustomersQuerySchema = z.object({
  store_id: z.uuid('Invalid store id'),
})

export const createCustomerSchema = z.object({
  store_id: z.uuid('Invalid store id'),
  name: z.string().trim().min(1, 'Customer name is required').max(200),
  email: z.email('Invalid email').optional().or(z.literal('')),
  phone: z.string().trim().min(8).max(20).optional().or(z.literal('')),
})

export const publicCustomerByPhoneQuerySchema = z.object({
  phone: z.string().trim().min(8, 'Phone number is required').max(20),
})

export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>
export type CreateCustomerBody = z.infer<typeof createCustomerSchema>
export type PublicCustomerByPhoneQuery = z.infer<typeof publicCustomerByPhoneQuerySchema>
