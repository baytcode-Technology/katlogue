export type RazorpayMode = 'test' | 'live'

export type StoredPaymentConfig = {
  cod?: { enabled?: boolean }
  razorpay?: {
    enabled?: boolean
    key_id?: string
    key_secret_encrypted?: string
    webhook_secret_encrypted?: string
    mode?: RazorpayMode
  }
  upi?: {
    enabled?: boolean
    vpa?: string
    display_name?: string | null
    qr_image_url?: string | null
  }
}

export type MerchantPaymentConfigView = {
  cod: { enabled: boolean }
  razorpay: {
    enabled: boolean
    key_id: string | null
    key_secret_masked: string | null
    webhook_secret_masked: string | null
    mode: RazorpayMode
    configured: boolean
  }
  upi: {
    enabled: boolean
    vpa: string | null
    display_name: string | null
    qr_image_url: string | null
  }
}

export type PublicPaymentMethods = {
  cod: { enabled: boolean }
  razorpay: { enabled: boolean; key_id: string | null }
  upi: {
    enabled: boolean
    vpa: string | null
    display_name: string | null
    qr_image_url: string | null
  }
}

export type UpdatePaymentConfigInput = {
  cod?: { enabled: boolean }
  razorpay?: {
    enabled?: boolean
    key_id?: string
    key_secret?: string
    webhook_secret?: string
    mode?: RazorpayMode
  }
  upi?: {
    enabled?: boolean
    vpa?: string
    display_name?: string | null
    qr_image_url?: string | null
  }
}
