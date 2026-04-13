'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useAuth } from '@clerk/nextjs'
import useSWR from 'swr'
import { useSubmitStore } from '@/stores/submit-store'
import { useRouter } from '@/i18n/navigation'
import { apiFetch, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const LocationPicker = dynamic(
  () => import('@/components/map/location-picker').then((m) => m.LocationPicker),
  { ssr: false },
)

const YEREVAN_LAT = 40.1872
const YEREVAN_LNG = 44.5152
const POLL_TIMEOUT_MS = 60_000

const PROBLEM_TYPES = [
  'pothole',
  'damaged_barrier',
  'missing_marking',
  'damaged_sign',
  'hazard',
  'broken_light',
  'missing_ramp',
  'other',
] as const

type ProblemType = (typeof PROBLEM_TYPES)[number]

const PROBLEM_TYPE_LABELS: Record<ProblemType, string> = {
  pothole: 'Яма',
  damaged_barrier: 'Повреждённое ограждение',
  missing_marking: 'Отсутствие разметки',
  damaged_sign: 'Повреждённый знак',
  hazard: 'Опасность',
  broken_light: 'Неработающий светофор',
  missing_ramp: 'Отсутствие пандуса',
  other: 'Другое',
}

interface ClassifyJobResponse {
  job_token: string
}

interface ClassifyPollResponse {
  status: 'pending' | 'done' | 'failed'
  problem_type_ai: string | null
}

interface CreateReportResponse {
  id: string
}

// ─── Step 1 ──────────────────────────────────────────────────────────────────

interface Step1Props {
  onNext: () => void
}

function Step1({ onNext }: Step1Props) {
  const { getToken } = useAuth()
  const {
    photoFile,
    jobToken,
    selectedType,
    setPhoto,
    setJobToken,
    setSelectedType,
  } = useSubmitStore()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [aiType, setAiType] = useState<string | null>(null)
  const [aiNoResult, setAiNoResult] = useState(false)
  const [pollStarted, setPollStarted] = useState<number | null>(null)
  const [pollDone, setPollDone] = useState(false)

  // Polling with SWR
  const { data: pollData } = useSWR<ClassifyPollResponse>(
    jobToken && !pollDone
      ? `/api/v1/classify/${jobToken}`
      : null,
    async (url: string) => {
      const token = await getToken()
      return apiFetch<ClassifyPollResponse>(url, undefined, token ?? undefined)
    },
    { refreshInterval: 2000 },
  )

  useEffect(() => {
    if (!pollData) return
    if (pollData.status === 'pending') {
      // Check timeout
      if (pollStarted && Date.now() - pollStarted > POLL_TIMEOUT_MS) {
        setPollDone(true)
        setAiNoResult(true)
      }
      return
    }
    setPollDone(true)
    if (pollData.status === 'done' && pollData.problem_type_ai) {
      setAiType(pollData.problem_type_ai)
      // Pre-select AI suggestion
      setSelectedType(pollData.problem_type_ai)
    } else {
      setAiNoResult(true)
    }
  }, [pollData, pollStarted, setSelectedType])

  const handleFileSelect = useCallback(
    async (file: File) => {
      setUploadError(null)
      setAiType(null)
      setAiNoResult(false)
      setPollDone(false)

      const url = URL.createObjectURL(file)
      setPreview(url)
      setPhoto(file)

      setUploading(true)
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
        setJobToken(json.job_token)
        setPollStarted(Date.now())
      } catch {
        setUploadError('Ошибка загрузки фото. Попробуйте ещё раз.')
        setAiNoResult(true)
      } finally {
        setUploading(false)
      }
    },
    [getToken, setPhoto, setJobToken],
  )

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void handleFileSelect(file)
  }

  const isPolling = !!jobToken && !pollDone && !uploading
  const showCategories = !uploading && (pollDone || aiNoResult) && !!photoFile

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Фото</h1>

      {/* Dropzone */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-muted-foreground transition-colors hover:border-primary hover:text-primary',
          preview ? 'border-solid border-border' : 'border-muted-foreground/30',
        )}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Preview" className="max-h-64 rounded object-contain" />
        ) : (
          <span className="text-sm">Нажмите или перетащите фото</span>
        )}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {uploadError && (
        <p className="text-sm text-destructive">{uploadError}</p>
      )}

      {/* Spinner while uploading */}
      {uploading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <svg
            className="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Загрузка...
        </div>
      )}

      {/* Polling indicator */}
      {isPolling && (
        <p className="text-sm text-muted-foreground">Анализируем фото...</p>
      )}

      {/* No AI result message */}
      {aiNoResult && (
        <p className="text-sm text-muted-foreground">
          Не удалось определить автоматически — выберите вручную
        </p>
      )}

      {/* Category grid */}
      {showCategories && (
        <div>
          <p className="mb-2 text-sm font-medium">Выберите категорию</p>
          {aiType && (
            <p className="mb-2 text-xs text-muted-foreground">
              Предложение AI:{' '}
              <span className="font-medium text-foreground">
                {PROBLEM_TYPE_LABELS[aiType as ProblemType] ?? aiType}
              </span>
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PROBLEM_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedType(type)}
                className={cn(
                  'rounded-md border px-3 py-2 text-sm transition-colors',
                  selectedType === type
                    ? 'border-primary bg-primary text-primary-foreground'
                    : type === aiType
                      ? 'border-primary/50 bg-primary/10 text-foreground hover:bg-primary/20'
                      : 'border-border bg-background hover:bg-accent',
                )}
              >
                {PROBLEM_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>
      )}

      <Button
        onClick={onNext}
        disabled={!selectedType}
        className="w-full"
      >
        Далее →
      </Button>
    </div>
  )
}

// ─── Step 2 ──────────────────────────────────────────────────────────────────

interface Step2Props {
  onBack: () => void
}

function Step2({ onBack }: Step2Props) {
  const { getToken } = useAuth()
  const router = useRouter()

  const { jobToken, selectedType, lat, lng, description, setLocation, setDescription, reset } =
    useSubmitStore()

  const [mapLat, setMapLat] = useState<number>(lat ?? YEREVAN_LAT)
  const [mapLng, setMapLng] = useState<number>(lng ?? YEREVAN_LNG)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Try to get user's geolocation on mount
  useEffect(() => {
    if (lat !== null && lng !== null) return
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMapLat(pos.coords.latitude)
        setMapLng(pos.coords.longitude)
        setLocation(pos.coords.latitude, pos.coords.longitude)
      },
      () => {
        // Fall back to Yerevan
        setLocation(YEREVAN_LAT, YEREVAN_LNG)
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleMarkerChange = (newLat: number, newLng: number) => {
    setMapLat(newLat)
    setMapLng(newLng)
    setLocation(newLat, newLng)
  }

  const handleSubmit = async () => {
    setSubmitError(null)

    if (!selectedType) {
      setSubmitError('Выберите категорию')
      return
    }

    setSubmitting(true)
    try {
      const token = await getToken()

      const body: Record<string, unknown> = {
        job_token: jobToken,
        latitude: mapLat,
        longitude: mapLng,
        problem_type_user: selectedType,
      }
      if (description.trim()) {
        body.description = description.trim()
      }

      const result = await apiFetch<CreateReportResponse>(
        '/api/v1/reports',
        { method: 'POST', body: JSON.stringify(body) },
        token ?? undefined,
      )
      reset()
      router.push(`/profile/reports/${result.id}`)
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(`Ошибка: ${err.code}`)
      } else {
        setSubmitError('Ошибка при отправке. Попробуйте ещё раз.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Место и описание</h1>

      <div>
        <p className="mb-2 text-sm text-muted-foreground">
          Перетащите маркер на точное место
        </p>
        <LocationPicker
          lat={mapLat}
          lng={mapLng}
          onChange={handleMarkerChange}
        />
      </div>

      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium">
          Описание (необязательно)
        </label>
        <textarea
          id="description"
          rows={4}
          maxLength={1000}
          placeholder="Подробнее..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="mt-1 text-right text-xs text-muted-foreground">
          {description.length}/1000
        </p>
      </div>

      {submitError && (
        <p className="text-sm text-destructive">{submitError}</p>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          ← Назад
        </Button>
        <Button
          onClick={() => void handleSubmit()}
          disabled={submitting}
          className="flex-1"
        >
          {submitting ? 'Отправляем...' : 'Отправить'}
        </Button>
      </div>
    </div>
  )
}

// ─── SubmitPage ───────────────────────────────────────────────────────────────

export default function SubmitPage() {
  const [step, setStep] = useState<1 | 2>(1)

  return (
    <div>
      {step === 1 ? (
        <Step1 onNext={() => setStep(2)} />
      ) : (
        <Step2 onBack={() => setStep(1)} />
      )}
    </div>
  )
}
