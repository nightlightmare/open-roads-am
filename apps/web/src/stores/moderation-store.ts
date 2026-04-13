import { create } from 'zustand'
import { apiFetch, ApiError } from '@/lib/api'

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

interface LockConflict {
  locked_by_display_name: string
  lock_expires_at: string
}

type ErrFmt = (err: unknown) => string
type GetToken = () => Promise<string | null>

// Heartbeat interval lives outside the store — one instance, module-level
let heartbeatId: ReturnType<typeof setInterval> | null = null

interface ModerationState {
  // Queue page
  pendingReports: QueueItem[]
  underReviewReports: QueueItem[]
  pendingCount: number
  loading: boolean
  error: string | null
  activeTab: 'pending' | 'under_review'
  // Review page
  currentReport: QueueItem | null
  reportLoading: boolean
  reportError: string | null
  reportLocked: LockConflict | null
  // Shared action state
  actionLoading: boolean
  actionError: string | null
  // Queue actions
  setActiveTab: (tab: 'pending' | 'under_review') => void
  setPendingCount: (count: number) => void
  loadQueue: (token: string, fmt: { error: ErrFmt }) => Promise<void>
  refetchPending: (token: string) => Promise<void>
  // Review actions
  openReport: (
    getToken: GetToken,
    reportId: string,
    fmt: { locked: string; error: string },
  ) => Promise<void>
  stopHeartbeat: () => void
  releaseLock: (token: string, reportId: string) => Promise<void>
  // Moderation actions
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
  currentReport: null,
  reportLoading: true,
  reportError: null,
  reportLocked: null,
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

  openReport: async (getToken, reportId, fmt) => {
    set({ reportLoading: true, reportError: null, reportLocked: null, currentReport: null })
    try {
      const token = await getToken()
      await apiFetch<unknown>(
        `/api/v1/moderation/reports/${reportId}/open`,
        { method: 'POST' },
        token ?? undefined,
      )
      const data = await apiFetch<QueueResponse>(
        '/api/v1/moderation/queue',
        { params: { status: 'under_review', limit: 100 } },
        token ?? undefined,
      )
      set({
        reportLoading: false,
        currentReport: data.reports.find((r) => r.id === reportId) ?? null,
      })

      // Start heartbeat — refreshes the lock every 5 minutes
      if (heartbeatId !== null) clearInterval(heartbeatId)
      heartbeatId = setInterval(async () => {
        const tk = await getToken()
        try {
          await apiFetch<unknown>(
            `/api/v1/moderation/reports/${reportId}/open`,
            { method: 'POST' },
            tk ?? undefined,
          )
        } catch {
          // ignore heartbeat errors
        }
      }, 5 * 60 * 1000)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        set({ reportLoading: false, reportLocked: { locked_by_display_name: fmt.locked, lock_expires_at: '' } })
      } else {
        set({ reportLoading: false, reportError: fmt.error })
      }
    }
  },

  stopHeartbeat: () => {
    if (heartbeatId !== null) {
      clearInterval(heartbeatId)
      heartbeatId = null
    }
  },

  releaseLock: async (token, reportId) => {
    try {
      await apiFetch<unknown>(
        `/api/v1/moderation/reports/${reportId}/lock`,
        { method: 'DELETE' },
        token,
      )
    } catch {
      // ignore lock release errors
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
