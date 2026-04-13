import { create } from 'zustand'

interface AdminState {
  // Users section
  roleLoading: boolean
  roleSuccess: string | null
  roleError: string | null
  setRoleLoading: (v: boolean) => void
  setRoleSuccess: (v: string | null) => void
  setRoleError: (v: string | null) => void
  // API keys section
  keyLoading: boolean
  keyError: string | null
  createdKey: { key: string; prefix: string } | null
  setKeyLoading: (v: boolean) => void
  setKeyError: (v: string | null) => void
  setCreatedKey: (v: { key: string; prefix: string } | null) => void
}

export const useAdminStore = create<AdminState>((set) => ({
  roleLoading: false,
  roleSuccess: null,
  roleError: null,
  setRoleLoading: (v) => set({ roleLoading: v }),
  setRoleSuccess: (v) => set({ roleSuccess: v }),
  setRoleError: (v) => set({ roleError: v }),
  keyLoading: false,
  keyError: null,
  createdKey: null,
  setKeyLoading: (v) => set({ keyLoading: v }),
  setKeyError: (v) => set({ keyError: v }),
  setCreatedKey: (v) => set({ createdKey: v }),
}))
