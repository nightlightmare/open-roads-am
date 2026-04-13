import { create } from 'zustand'
import { apiFetch } from '@/lib/api'

interface ClassifyJobResponse {
  job_token: string
}

interface CreateReportResponse {
  id: string
}

interface SubmitState {
  photoFile: File | null
  jobToken: string | null
  selectedType: string | null
  lat: number | null
  lng: number | null
  description: string
  uploading: boolean
  uploadError: string | null
  submitting: boolean
  submitError: string | null
  setPhoto: (file: File) => void
  setJobToken: (token: string) => void
  setSelectedType: (type: string) => void
  setLocation: (lat: number, lng: number) => void
  setDescription: (desc: string) => void
  reset: () => void
  uploadPhoto: (
    getToken: () => Promise<string | null>,
    file: File,
    fmt: { error: string },
  ) => Promise<void>
  submitReport: (
    token: string,
    fmt: { typeRequired: string; error: (err: unknown) => string },
  ) => Promise<string | null>
}

export const useSubmitStore = create<SubmitState>((set, get) => ({
  photoFile: null,
  jobToken: null,
  selectedType: null,
  lat: null,
  lng: null,
  description: '',
  uploading: false,
  uploadError: null,
  submitting: false,
  submitError: null,
  setPhoto: (file) => set({ photoFile: file, jobToken: null, selectedType: null }),
  setJobToken: (token) => set({ jobToken: token }),
  setSelectedType: (type) => set({ selectedType: type }),
  setLocation: (lat, lng) => set({ lat, lng }),
  setDescription: (desc) => set({ description: desc }),
  reset: () =>
    set({
      photoFile: null,
      jobToken: null,
      selectedType: null,
      lat: null,
      lng: null,
      description: '',
      uploading: false,
      uploadError: null,
      submitting: false,
      submitError: null,
    }),

  uploadPhoto: async (getToken, file, fmt) => {
    set({ uploading: true, uploadError: null })
    try {
      const token = await getToken()
      const formData = new FormData()
      formData.append('photo', file)
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL ?? ''}/api/v1/classify`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token ?? ''}` },
          body: formData,
        },
      )
      if (!res.ok) {
        throw new Error(`Upload failed: ${res.status}`)
      }
      const json = (await res.json()) as ClassifyJobResponse
      set({ jobToken: json.job_token })
    } catch {
      set({ uploadError: fmt.error })
    } finally {
      set({ uploading: false })
    }
  },

  submitReport: async (token, fmt) => {
    const { jobToken, selectedType, lat, lng, description } = get()

    if (!selectedType) {
      set({ submitError: fmt.typeRequired })
      return null
    }

    set({ submitting: true, submitError: null })
    try {
      const body: Record<string, unknown> = {
        job_token: jobToken,
        latitude: lat,
        longitude: lng,
        problem_type_user: selectedType,
      }
      if (description.trim()) {
        body.description = description.trim()
      }

      const result = await apiFetch<CreateReportResponse>(
        '/api/v1/reports',
        { method: 'POST', body: JSON.stringify(body) },
        token,
      )
      return result.id
    } catch (err) {
      set({ submitError: fmt.error(err) })
      return null
    } finally {
      set({ submitting: false })
    }
  },
}))
