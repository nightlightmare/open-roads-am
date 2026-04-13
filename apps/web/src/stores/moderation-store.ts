import { create } from 'zustand'

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

interface ModerationState {
  pendingReports: QueueItem[]
  underReviewReports: QueueItem[]
  pendingCount: number
  loading: boolean
  error: string | null
  activeTab: 'pending' | 'under_review'
  actionLoading: boolean
  actionError: string | null
  setPendingReports: (reports: QueueItem[]) => void
  setUnderReviewReports: (reports: QueueItem[]) => void
  setPendingCount: (count: number) => void
  setLoading: (v: boolean) => void
  setError: (v: string | null) => void
  setActiveTab: (tab: 'pending' | 'under_review') => void
  setActionLoading: (v: boolean) => void
  setActionError: (v: string | null) => void
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
  setPendingReports: (reports) => set({ pendingReports: reports }),
  setUnderReviewReports: (reports) => set({ underReviewReports: reports }),
  setPendingCount: (count) => set({ pendingCount: count }),
  setLoading: (v) => set({ loading: v }),
  setError: (v) => set({ error: v }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setActionLoading: (v) => set({ actionLoading: v }),
  setActionError: (v) => set({ actionError: v }),
}))
