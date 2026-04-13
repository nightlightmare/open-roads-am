import { create } from 'zustand'

interface MapFilters {
  problemTypes: string[]
  includeResolved: boolean
}

interface MapState {
  zoom: number
  center: [number, number]
  bbox: [number, number, number, number] | null
  filters: MapFilters
  setViewport: (zoom: number, center: [number, number], bbox: [number, number, number, number]) => void
  setFilters: (filters: Partial<MapFilters>) => void
}

export const useMapStore = create<MapState>((set) => ({
  zoom: 12,
  center: [44.5152, 40.1872], // Yerevan [lng, lat]
  bbox: null,
  filters: {
    problemTypes: [],
    includeResolved: false,
  },
  setViewport: (zoom, center, bbox) => set({ zoom, center, bbox }),
  setFilters: (filters) =>
    set((state) => ({ filters: { ...state.filters, ...filters } })),
}))
