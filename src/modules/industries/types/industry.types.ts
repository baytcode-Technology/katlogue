export type IndustryRow = {
  id: number
  parent_id: number | null
  name: string
  slug: string
  sort_order: number
  is_active: boolean
  created_at: string
}

export type IndustryChild = {
  id: number
  name: string
  slug: string
}

export type IndustryGroup = {
  id: number
  name: string
  slug: string
  children: IndustryChild[]
}
