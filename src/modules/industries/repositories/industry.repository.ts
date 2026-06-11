import supabaseAdmin from '../../../config/supabase.js'
import { AppError } from '../../../shared/errors/app.error.js'
import type { IndustryRow } from '../types/industry.types.js'

export async function listActiveIndustries(): Promise<IndustryRow[]> {
  const { data, error } = await supabaseAdmin
    .from('industries')
    .select('id, parent_id, name, slug, sort_order, is_active, created_at')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    throw new AppError(400, error.message, 'INDUSTRY_LIST_FAILED')
  }

  return (data ?? []) as IndustryRow[]
}
