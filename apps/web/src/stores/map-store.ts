import { create } from 'zustand'

interface MapFilters {
  problemTypes: string[]
  activeStatuses: string[]
}

interface ReportListItem {
  id: string
  status: string
  problem_type: string | null
  address_raw: string | null
  confirmation_count: number
  photo_url: string | null
  created_at: string
  latitude: number
  longitude: number
}

interface SelectedReport {
  report: ReportListItem
  screenPosition: { x: number; y: number }
}

interface MapState {
  zoom: number
  center: [number, number]
  bbox: [number, number, number, number] | null
  filters: MapFilters
  reports: ReportListItem[]
  totalInArea: number
  selected: SelectedReport | null
  userLocation: [number, number] | null
  flyTo: ((lng: number, lat: number, zoom?: number) => void) | null
  setFlyTo: (fn: (lng: number, lat: number, zoom?: number) => void) => void
  setUserLocation: (coords: [number, number]) => void
  setViewport: (zoom: number, center: [number, number], bbox: [number, number, number, number]) => void
  setFilters: (filters: Partial<MapFilters>) => void
  setReports: (reports: ReportListItem[], totalInArea: number) => void
  selectReport: (report: ReportListItem, screenPosition: { x: number; y: number }) => void
  clearSelection: () => void
}

export type { ReportListItem, SelectedReport }

export const useMapStore = create<MapState>((set) => ({
  zoom: 12,
  center: [44.5152, 40.1872], // Yerevan [lng, lat]
  bbox: null,
  filters: {
    problemTypes: [],
    activeStatuses: ['approved', 'in_progress'],
  },
  reports: [],
  totalInArea: 0,
  selected: null,
  userLocation: null,
  flyTo: null,
  setFlyTo: (fn) => set({ flyTo: fn }),
  setUserLocation: (coords) => set({ userLocation: coords }),
  setViewport: (zoom, center, bbox) => set({ zoom, center, bbox }),
  setFilters: (filters) =>
    set((state) => ({ filters: { ...state.filters, ...filters } })),
  setReports: (reports, totalInArea) => set({ reports, totalInArea }),
  selectReport: (report, screenPosition) => set({ selected: { report, screenPosition } }),
  clearSelection: () => set({ selected: null }),
}))
