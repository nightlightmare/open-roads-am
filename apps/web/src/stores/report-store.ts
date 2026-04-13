import { create } from 'zustand'
import { apiFetch, ApiError } from '@/lib/api'

// ─── Public Report types ───────────────────────────────────────────────────

export interface StatusHistoryEntry {
  status: string
  changed_at: string
  note: string | null
}

export interface PublicReport {
  id: string
  status: string
  problem_type: string | null
  description: string | null
  latitude: number
  longitude: number
  address_raw: string | null
  photo_url: string | null
  confirmation_count: number
  status_history: StatusHistoryEntry[]
  created_at: string
  updated_at: string
}

// ─── Public Report store ───────────────────────────────────────────────────

interface PublicReportState {
  report: PublicReport | null
  reportPageLoading: boolean
  reportPageError: string | null
  fetchReport: (id: string, fmt: { error: string }) => Promise<void>
}

export const usePublicReportStore = create<PublicReportState>((set) => ({
  report: null,
  reportPageLoading: false,
  reportPageError: null,

  fetchReport: async (id, fmt) => {
    set({ reportPageLoading: true, reportPageError: null })
    try {
      const data = await apiFetch<PublicReport>(`/api/v1/public/reports/${id}`)
      set({ report: data })
    } catch {
      set({ reportPageError: fmt.error })
    } finally {
      set({ reportPageLoading: false })
    }
  },
}))

// ─── Confirm store ─────────────────────────────────────────────────────────

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
