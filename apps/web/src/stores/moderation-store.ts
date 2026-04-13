import { create } from 'zustand'
import { apiFetch } from '@/lib/api'

export interface QueueItem {
  id: string
  status: string
  problem_type_user: string | null
  problem_type_ai: string | null
  ai_confidence: number | null
  description: string | null
  latitude: number
  longitude: number
  address_raw: string | null
  photo_url: string | null
  photo_thumbnail_url: string | null
  confirmation_count: number
  created_at: string
}

interface QueueResponse {
  reports: QueueItem[]
  cursor: string | null
  total_pending: number
}

type ErrFmt = (err: unknown) => string

interface ModerationState {
  pendingReports: QueueItem[]
  underReviewReports: QueueItem[]
  pendingCount: number
  loading: boolean
  error: string | null
  activeTab: 'pending' | 'under_review'
  actionLoading: boolean
  actionError: string | null
  setActiveTab: (tab: 'pending' | 'under_review') => void
  setPendingCount: (count: number) => void
  loadQueue: (token: string, fmt: { error: ErrFmt }) => Promise<void>
  refetchPending: (token: string) => Promise<void>
  approveReport: (
    token: string,
    reportId: string,
    overrideType: string | null,
    fmt: { error: ErrFmt },
  ) => Promise<boolean>
  rejectReport: (
    token: string,
    reportId: string,
    reason: string,
    fmt: { error: ErrFmt },
  ) => Promise<boolean>
  clearActionError: () => void
}

export const useModerationStore = create<ModerationState>((set) => ({
  pendingReports: [],
  underReviewReports: [],
  pendingCount: 0,
  loading: true,
  error: null,
  activeTab: 'pending',
  actionLoading: false,
  actionError: null,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setPendingCount: (count) => set({ pendingCount: count }),

  loadQueue: async (token, fmt) => {
    set({ loading: true, error: null })
    try {
      const [pendingData, underReviewData] = await Promise.all([
        apiFetch<QueueResponse>(
          '/api/v1/moderation/queue',
          { params: { status: 'pending_review', limit: 20 } },
          token,
        ),
        apiFetch<QueueResponse>(
          '/api/v1/moderation/queue',
          { params: { status: 'under_review', limit: 20 } },
          token,
        ),
      ])
      set({
        loading: false,
        pendingReports: pendingData.reports,
        pendingCount: pendingData.total_pending,
        underReviewReports: underReviewData.reports,
      })
    } catch (err) {
      set({ loading: false, error: fmt.error(err) })
    }
  },

  refetchPending: async (token) => {
    try {
      const data = await apiFetch<QueueResponse>(
        '/api/v1/moderation/queue',
        { params: { status: 'pending_review', limit: 20 } },
        token,
      )
      set({ pendingReports: data.reports })
    } catch {
      // silent background refetch — leave existing state intact
    }
  },

  approveReport: async (token, reportId, overrideType, fmt) => {
    set({ actionLoading: true, actionError: null })
    try {
      const body: Record<string, unknown> = {}
      if (overrideType) body.problem_type_override = overrideType
      await apiFetch<unknown>(
        `/api/v1/moderation/reports/${reportId}/approve`,
        { method: 'POST', body: JSON.stringify(body) },
        token,
      )
      set({ actionLoading: false })
      return true
    } catch (err) {
      set({ actionLoading: false, actionError: fmt.error(err) })
      return false
    }
  },

  rejectReport: async (token, reportId, reason, fmt) => {
    set({ actionLoading: true, actionError: null })
    try {
      await apiFetch<unknown>(
        `/api/v1/moderation/reports/${reportId}/reject`,
        { method: 'POST', body: JSON.stringify({ rejection_reason: reason }) },
        token,
      )
      set({ actionLoading: false })
      return true
    } catch (err) {
      set({ actionLoading: false, actionError: fmt.error(err) })
      return false
    }
  },

  clearActionError: () => set({ actionError: null }),
}))
