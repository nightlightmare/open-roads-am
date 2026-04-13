import { create } from 'zustand'
import { apiFetch, ApiError } from '@/lib/api'

interface ConfirmResponse {
  report_id: string
  confirmation_count: number
}

interface ReportConfirmState {
  confirmed: boolean
  count: number
  loading: boolean
  message: string | null
  init: (confirmed: boolean, count: number) => void
  toggle: (
    token: string,
    reportId: string,
    fmt: {
      alreadyConfirmed: string
      ownReport: string
      retry: string
    },
  ) => Promise<void>
}

export const useReportConfirmStore = create<ReportConfirmState>((set, get) => ({
  confirmed: false,
  count: 0,
  loading: false,
  message: null,

  init: (confirmed, count) => set({ confirmed, count }),

  toggle: async (token, reportId, fmt) => {
    const { confirmed, count } = get()
    set({ loading: true, message: null })

    // Optimistic update
    set({ confirmed: !confirmed, count: confirmed ? count - 1 : count + 1 })

    try {
      const result = await apiFetch<ConfirmResponse>(
        `/api/v1/reports/${reportId}/confirm`,
        { method: confirmed ? 'DELETE' : 'POST' },
        token,
      )
      set({ loading: false, count: result.confirmation_count })
    } catch (err) {
      // Revert optimistic update
      set({ confirmed, count, loading: false })

      if (err instanceof ApiError) {
        if (err.code === 'ALREADY_CONFIRMED') {
          set({ message: fmt.alreadyConfirmed, confirmed: true })
        } else if (err.code === 'OWN_REPORT') {
          set({ message: fmt.ownReport })
        } else {
          set({ message: fmt.retry })
        }
      }
    }
  },
}))
