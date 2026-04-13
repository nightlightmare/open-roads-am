import { create } from 'zustand'

interface SubmitState {
  photoFile: File | null
  jobToken: string | null
  selectedType: string | null
  lat: number | null
  lng: number | null
  description: string
  setPhoto: (file: File) => void
  setJobToken: (token: string) => void
  setSelectedType: (type: string) => void
  setLocation: (lat: number, lng: number) => void
  setDescription: (desc: string) => void
  reset: () => void
}

export const useSubmitStore = create<SubmitState>((set) => ({
  photoFile: null,
  jobToken: null,
  selectedType: null,
  lat: null,
  lng: null,
  description: '',
  setPhoto: (file) => set({ photoFile: file, jobToken: null, selectedType: null }),
  setJobToken: (token) => set({ jobToken: token }),
  setSelectedType: (type) => set({ selectedType: type }),
  setLocation: (lat, lng) => set({ lat, lng }),
  setDescription: (desc) => set({ description: desc }),
  reset: () =>
    set({ photoFile: null, jobToken: null, selectedType: null, lat: null, lng: null, description: '' }),
}))
