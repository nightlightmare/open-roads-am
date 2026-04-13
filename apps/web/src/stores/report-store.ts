import { create } from 'zustand'

interface ReportConfirmState {
  confirmed: boolean
  count: number
  loading: boolean
  message: string | null
  setConfirmed: (v: boolean) => void
  setCount: (v: number) => void
  setLoading: (v: boolean) => void
  setMessage: (v: string | null) => void
}

export const useReportConfirmStore = create<ReportConfirmState>((set) => ({
  confirmed: false,
  count: 0,
  loading: false,
  message: null,
  setConfirmed: (v) => set({ confirmed: v }),
  setCount: (v) => set({ count: v }),
  setLoading: (v) => set({ loading: v }),
  setMessage: (v) => set({ message: v }),
}))
