import { create } from 'zustand'
import { apiFetch } from '@/lib/api'
import type { ReportStatus } from '@/lib/constants'

// ─── Types ─────────────────────────────────────────────────────────────────

export type StatusFilter = 'all' | ReportStatus

export interface ReportSummary {
  id: string
  problem_type: string
  address_raw: string | null
  status: ReportStatus
  created_at: string
  photo_thumbnail_url: string | null
}

interface ReportsResponse {
  reports: ReportSummary[]
  cursor: string | null
}

export interface ConfirmationItem {
  report_id: string
  problem_type: string | null
  address_raw: string | null
  photo_thumbnail_url: string | null
  report_status: ReportStatus
  confirmed_at: string
}

interface ConfirmationsResponse {
  confirmations: ConfirmationItem[]
  cursor: string | null
}

export interface ProfileReportDetail {
  id: string
  status: ReportStatus
  problem_type: string
  problem_type_user: string | null
  problem_type_ai: string | null
  ai_confidence: number | null
  description: string | null
  latitude: number
  longitude: number
  address_raw: string | null
  photo_url: string | null
  confirmation_count: number
  status_history: Array<{
    status: ReportStatus
    changed_at: string
    note: string | null
  }>
  created_at: string
  updated_at: string
}

// ─── Store ─────────────────────────────────────────────────────────────────

interface ProfileState {
  // Reports list
  reports: ReportSummary[]
  reportsLoading: boolean
  reportsLoadingMore: boolean
  reportsError: string | null
  reportsCursor: string | null
  reportsActiveTab: StatusFilter
  fetchReports: (
    getToken: () => Promise<string | null>,
    status: StatusFilter,
    fmt: { error: string },
  ) => Promise<void>
  loadMoreReports: (
    getToken: () => Promise<string | null>,
    fmt: { error: string },
  ) => Promise<void>
  setReportsTab: (tab: StatusFilter) => void

  // Profile report detail
  profileReport: ProfileReportDetail | null
  profileReportLoading: boolean
  profileReportError: string | null
  fetchProfileReport: (
    getToken: () => Promise<string | null>,
    reportId: string,
    fmt: { error: string },
  ) => Promise<void>

  // Confirmations list
  confirmations: ConfirmationItem[]
  confirmationsLoading: boolean
  confirmationsLoadingMore: boolean
  confirmationsError: string | null
  confirmationsCursor: string | null
  fetchConfirmations: (
    getToken: () => Promise<string | null>,
    fmt: { error: string },
  ) => Promise<void>
  loadMoreConfirmations: (
    getToken: () => Promise<string | null>,
    fmt: { error: string },
  ) => Promise<void>
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  // ── Reports list ──────────────────────────────────────────────────────────
  reports: [],
  reportsLoading: false,
  reportsLoadingMore: false,
  reportsError: null,
  reportsCursor: null,
  reportsActiveTab: 'all',

  fetchReports: async (getToken, status, fmt) => {
    set({ reportsLoading: true, reportsError: null })
    try {
      const token = await getToken()
      const queryParams: Record<string, string | number | boolean | undefined> = { limit: 20 }
      if (status !== 'all') queryParams['status'] = status

      const data = await apiFetch<ReportsResponse>(
        '/api/v1/me/reports',
        { params: queryParams },
        token ?? undefined,
      )
      set({ reports: data.reports, reportsCursor: data.cursor })
    } catch {
      set({ reportsError: fmt.error })
    } finally {
      set({ reportsLoading: false })
    }
  },

  loadMoreReports: async (getToken, fmt) => {
    const { reportsCursor, reportsActiveTab, reports } = get()
    if (!reportsCursor) return
    set({ reportsLoadingMore: true })
    try {
      const token = await getToken()
      const queryParams: Record<string, string | number | boolean | undefined> = {
        limit: 20,
        cursor: reportsCursor,
      }
      if (reportsActiveTab !== 'all') queryParams['status'] = reportsActiveTab

      const data = await apiFetch<ReportsResponse>(
        '/api/v1/me/reports',
        { params: queryParams },
        token ?? undefined,
      )
      set({ reports: [...reports, ...data.reports], reportsCursor: data.cursor })
    } catch {
      set({ reportsError: fmt.error })
    } finally {
      set({ reportsLoadingMore: false })
    }
  },

  setReportsTab: (tab) => set({ reportsActiveTab: tab, reports: [], reportsCursor: null }),

  // ── Profile report detail ─────────────────────────────────────────────────
  profileReport: null,
  profileReportLoading: false,
  profileReportError: null,

  fetchProfileReport: async (getToken, reportId, fmt) => {
    set({ profileReportLoading: true, profileReportError: null })
    try {
      const token = await getToken()
      const data = await apiFetch<ProfileReportDetail>(
        `/api/v1/me/reports/${reportId}`,
        undefined,
        token ?? undefined,
      )
      set({ profileReport: data })
    } catch {
      set({ profileReportError: fmt.error })
    } finally {
      set({ profileReportLoading: false })
    }
  },

  // ── Confirmations ─────────────────────────────────────────────────────────
  confirmations: [],
  confirmationsLoading: false,
  confirmationsLoadingMore: false,
  confirmationsError: null,
  confirmationsCursor: null,

  fetchConfirmations: async (getToken, fmt) => {
    set({ confirmationsLoading: true, confirmationsError: null })
    try {
      const token = await getToken()
      const data = await apiFetch<ConfirmationsResponse>(
        '/api/v1/me/confirmations',
        { params: { limit: 20 } },
        token ?? undefined,
      )
      set({ confirmations: data.confirmations, confirmationsCursor: data.cursor })
    } catch {
      set({ confirmationsError: fmt.error })
    } finally {
      set({ confirmationsLoading: false })
    }
  },

  loadMoreConfirmations: async (getToken, fmt) => {
    const { confirmationsCursor, confirmations } = get()
    if (!confirmationsCursor) return
    set({ confirmationsLoadingMore: true })
    try {
      const token = await getToken()
      const data = await apiFetch<ConfirmationsResponse>(
        '/api/v1/me/confirmations',
        { params: { limit: 20, cursor: confirmationsCursor } },
        token ?? undefined,
      )
      set({
        confirmations: [...confirmations, ...data.confirmations],
        confirmationsCursor: data.cursor,
      })
    } catch {
      set({ confirmationsError: fmt.error })
    } finally {
      set({ confirmationsLoadingMore: false })
    }
  },
}))
