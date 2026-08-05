import { supabaseAdmin } from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'

export async function upsertStoreNumber(input: {
  storeId: number
  waPhoneNumberId: string
  waBusinessAccountId: string | null
}): Promise<void> {
  const { error } = await supabaseAdmin.from('whatsapp_store_numbers').upsert(
    {
      store_id: input.storeId,
      wa_phone_number_id: input.waPhoneNumberId,
      wa_business_account_id: input.waBusinessAccountId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'wa_phone_number_id' }
  )

  if (error) {
    throw new AppError(400, error.message, 'WHATSAPP_STORE_NUMBER_UPSERT_FAILED')
  }
}

export async function deleteStoreNumbersForStore(storeId: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from('whatsapp_store_numbers')
    .delete()
    .eq('store_id', storeId)

  if (error) {
    throw new AppError(400, error.message, 'WHATSAPP_STORE_NUMBER_DELETE_FAILED')
  }
}
