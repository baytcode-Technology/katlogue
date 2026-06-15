import { z } from 'zod'

export const shippingAddressSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  phone_number: z.string().trim().min(8, 'Phone number is required').max(20),
  whatsapp_number: z.string().trim().min(8, 'WhatsApp number is required').max(20),
  address: z.string().trim().min(1, 'Address is required').max(500),
  postcode: z.string().trim().min(1, 'Postcode is required').max(20),
  city: z.string().trim().min(1, 'City is required').max(100),
  district: z.string().trim().min(1, 'District is required').max(100),
  state: z.string().trim().min(1, 'State is required').max(100),
  region: z.string().trim().min(1, 'Region is required').max(100),
})

export type ShippingAddress = z.infer<typeof shippingAddressSchema>

/** Storefront online checkout — required shipping fields. */
export const storefrontShippingAddressSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  phone_number: z.string().trim().min(8, 'Phone number is required').max(20),
  address: z.string().trim().min(1, 'Address is required').max(500),
  city: z.string().trim().min(1, 'City is required').max(100),
  district: z.string().trim().min(1, 'District is required').max(100),
  state: z.string().trim().min(1, 'State is required').max(100),
  postcode: z.string().trim().min(1, 'Postcode is required').max(20),
})

export type StorefrontShippingAddress = z.infer<typeof storefrontShippingAddressSchema>

/** Partial address — all fields optional (offline / merchant orders). */
export const optionalShippingAddressSchema = z
  .object({
    name: z.preprocess(
      (v) => (v === '' || v === null ? undefined : v),
      z.string().trim().max(200).optional()
    ),
    phone_number: z.preprocess(
      (v) => (v === '' || v === null ? undefined : v),
      z.string().trim().max(20).optional()
    ),
    whatsapp_number: z.preprocess(
      (v) => (v === '' || v === null ? undefined : v),
      z.string().trim().max(20).optional()
    ),
    address: z.preprocess(
      (v) => (v === '' || v === null ? undefined : v),
      z.string().trim().max(500).optional()
    ),
    postcode: z.preprocess(
      (v) => (v === '' || v === null ? undefined : v),
      z.string().trim().max(20).optional()
    ),
    city: z.preprocess(
      (v) => (v === '' || v === null ? undefined : v),
      z.string().trim().max(100).optional()
    ),
    district: z.preprocess(
      (v) => (v === '' || v === null ? undefined : v),
      z.string().trim().max(100).optional()
    ),
    state: z.preprocess(
      (v) => (v === '' || v === null ? undefined : v),
      z.string().trim().max(100).optional()
    ),
    region: z.preprocess(
      (v) => (v === '' || v === null ? undefined : v),
      z.string().trim().max(100).optional()
    ),
  })
  .transform((addr) => {
    const street = addr.address?.trim() || addr.region?.trim()
    return street ? { ...addr, address: street } : addr
  })

export type OptionalShippingAddress = z.infer<typeof optionalShippingAddressSchema>
