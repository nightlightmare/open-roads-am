import { create } from 'zustand'
import { apiFetch } from '@/lib/api'
import type { Role } from '@/lib/constants'

interface CreatedKey {
  key: string
  prefix: string
}

type ErrFmt = (err: unknown) => string

interface AdminState {
  roleLoading: boolean
  roleSuccess: string | null
  roleError: string | null
  keyLoading: boolean
  keyError: string | null
  createdKey: CreatedKey | null
  changeRole: (
    token: string,
    clerkId: string,
    role: Role,
    fmt: { success: string; error: ErrFmt },
  ) => Promise<boolean>
  createApiKey: (
    token: string,
    description: string,
    fmt: { error: ErrFmt },
  ) => Promise<boolean>
  clearCreatedKey: () => void
}

export const useAdminStore = create<AdminState>((set) => ({
  roleLoading: false,
  roleSuccess: null,
  roleError: null,
  keyLoading: false,
  keyError: null,
  createdKey: null,

  changeRole: async (token, clerkId, role, fmt) => {
    set({ roleLoading: true, roleSuccess: null, roleError: null })
    try {
      await apiFetch<unknown>(
        `/api/v1/admin/users/${clerkId}/role`,
        { method: 'POST', body: JSON.stringify({ role }) },
        token,
      )
      set({ roleLoading: false, roleSuccess: fmt.success })
      return true
    } catch (err) {
      set({ roleLoading: false, roleError: fmt.error(err) })
      return false
    }
  },

  createApiKey: async (token, description, fmt) => {
    set({ keyLoading: true, keyError: null })
    try {
      const data = await apiFetch<CreatedKey>(
        '/api/v1/admin/api-keys',
        { method: 'POST', body: JSON.stringify({ description: description.trim() || undefined }) },
        token,
      )
      set({ keyLoading: false, createdKey: data })
      return true
    } catch (err) {
      set({ keyLoading: false, keyError: fmt.error(err) })
      return false
    }
  },

  clearCreatedKey: () => set({ createdKey: null }),
}))
