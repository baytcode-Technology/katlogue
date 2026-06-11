export type IndustryRow = {
  id: string
  parent_id: string | null
  name: string
  slug: string
  sort_order: number
  is_active: boolean
  created_at: string
}

export type IndustryChild = {
  id: string
  name: string
  slug: string
}

export type IndustryGroup = {
  id: string
  name: string
  slug: string
  children: IndustryChild[]
}
