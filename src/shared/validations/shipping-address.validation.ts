import { z } from 'zod'

export const shippingAddressSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  phone_number: z.string().trim().min(8, 'Phone number is required').max(20),
  whatsapp_number: z.string().trim().min(8, 'WhatsApp number is required').max(20),
  postcode: z.string().trim().min(1, 'Postcode is required').max(20),
  city: z.string().trim().min(1, 'City is required').max(100),
  district: z.string().trim().min(1, 'District is required').max(100),
  state: z.string().trim().min(1, 'State is required').max(100),
  region: z.string().trim().min(1, 'Region is required').max(100),
})

export type ShippingAddress = z.infer<typeof shippingAddressSchema>
