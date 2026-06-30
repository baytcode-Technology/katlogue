export type StoreStaffStatus = 'pending' | 'active'

export type StoreStaffRow = {
  id: number
  store_id: number
  email: string
  user_id: string | null
  invited_by: string
  status: StoreStaffStatus
  created_at: string
}

export type StoreAccessRole = 'owner' | 'staff'

export type StoreWithRole = {
  store: import('./store.types.js').Store
  role: StoreAccessRole
}

export type StaffListMember = {
  id: number | null
  email: string
  user_id: string | null
  role: 'owner' | 'staff'
  status: StoreStaffStatus | 'owner'
}
