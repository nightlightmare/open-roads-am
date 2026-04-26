'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Upload } from 'lucide-react'
import dynamic from 'next/dynamic'
import useSWR from 'swr'
import { Link, useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { useSubmitStore } from '@/stores/submit-store'
import { apiFetch, ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { PROBLEM_TYPES, POLL_TIMEOUT_MS, YEREVAN_LAT, YEREVAN_LNG } from '@/lib/constants'

const LocationPicker = dynamic(
  () => import('@/components/map/location-picker').then((m) => m.LocationPicker),
  { ssr: false },
)

interface ClassifyPollResponse {
  status: 'pending' | 'done' | 'failed'
  problem_type_ai: string | null
}

export default function SubmitPage() {
  const { getToken } = useAuth()
  const router = useRouter()
  const t = useTranslations()
  const tSubmit = useTranslations('submit')
  const tType = useTranslations('report.problemType')

  const {
    photoFile, jobToken, selectedType, uploading, uploadError,
    lat, lng, description, submitting, submitError,
    setPhoto, setSelectedType, uploadPhoto,
    setLocation, setDescription, reset, submitReport,
  } = useSubmitStore()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [aiType, setAiType] = useState<string | null>(null)
  const [aiNoResult, setAiNoResult] = useState(false)
  const [pollStarted, setPollStarted] = useState<number | null>(null)
  const [pollDone, setPollDone] = useState(false)

  // --- Photo & AI polling ---
  const { data: pollData } = useSWR<ClassifyPollResponse>(
    jobToken && !pollDone ? `/api/v1/classify/${jobToken}` : null,
    async (url: string) => {
      const token = await getToken()
      return apiFetch<ClassifyPollResponse>(url, undefined, token ?? undefined)
    },
    { refreshInterval: 2000 },
  )

  useEffect(() => {
    if (!pollStarted || pollDone) return
    const timer = setTimeout(() => { setPollDone(true); setAiNoResult(true) }, POLL_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [pollStarted, pollDone])

  useEffect(() => {
    if (!pollData || pollDone) return
    if (pollData.status === 'pending') return
    setPollDone(true)
    if (pollData.status === 'done' && pollData.problem_type_ai) {
      setAiType(pollData.problem_type_ai)
      setSelectedType(pollData.problem_type_ai)
    } else {
      setAiNoResult(true)
    }
  }, [pollData, pollDone, setSelectedType])

  const handleFileSelect = useCallback(async (file: File) => {
    setAiType(null); setAiNoResult(false); setPollDone(false)
    setPreview(URL.createObjectURL(file))
    setPhoto(file)
    await uploadPhoto(getToken, file, { error: t('errors.photoUploadFailed') })
    const { jobToken: token, uploadError: err } = useSubmitStore.getState()
    if (token && !err) setPollStarted(Date.now())
  }, [getToken, setPhoto, uploadPhoto, t])

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void handleFileSelect(file)
  }

  // --- Location ---
  const mapLat = lat ?? YEREVAN_LAT
  const mapLng = lng ?? YEREVAN_LNG
  const hasInitialLocation = useRef(lat !== null && lng !== null)
  useEffect(() => {
    if (hasInitialLocation.current || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation(pos.coords.latitude, pos.coords.longitude),
      () => setLocation(YEREVAN_LAT, YEREVAN_LNG),
    )
  }, [setLocation])

  // --- Submit ---
  const handleSubmit = async () => {
    const token = await getToken()
    const reportId = await submitReport(token ?? '', {
      typeRequired: t('submit.errors.typeRequired'),
      error: (err) => {
        if (err instanceof ApiError) return t('errors.errorWithCode', { status: err.status, code: err.code })
        return t('errors.submitFailed')
      },
    })
    if (reportId) { reset(); router.push(`/profile/reports/${reportId}`) }
  }

  const isPolling = !!jobToken && !pollDone && !uploading
  const showCategories = !uploading && (pollDone || aiNoResult || !!uploadError) && !!photoFile
  const canSubmit = !!selectedType && !submitting && !!photoFile

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col md:flex-row">
      {/* LEFT: Photo + AI */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto border-b border-border p-6 md:border-b-0 md:border-r md:p-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2">
          <Link href="/map" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
            {t('report.backToMap')}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">/</span>
          <span className="font-mono text-[11px] uppercase tracking-wide text-foreground">
            {tSubmit('title')}
          </span>
        </div>

        <h1 className="text-2xl font-bold tracking-tight">{tSubmit('title')}</h1>

        {/* Photo dropzone */}
        <button
          type="button"
          data-testid="photo-dropzone"
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'flex flex-col items-center justify-center overflow-hidden rounded-sm border-2 border-dashed p-8 text-muted-foreground transition-colors hover:border-primary hover:text-primary',
            preview ? 'border-solid border-border' : 'border-muted-foreground/30',
            preview ? 'min-h-[200px]' : 'min-h-[300px]',
          )}
        >
          {preview ? (
            <img src={preview} alt="Preview" className="max-h-72 w-full rounded object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Upload className="h-8 w-8 opacity-40" />
              <span className="text-sm">{tSubmit('step1.dropzone')}</span>
            </div>
          )}
        </button>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={handleFileInputChange} />

        {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
        {uploading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="h-4 w-4 animate-spin" />
            {t('map.loading')}
          </div>
        )}
        {isPolling && <p className="text-sm text-muted-foreground">{tSubmit('step1.analyzing')}</p>}

        {/* AI classification panel */}
        {showCategories && (
          <div className="rounded-sm border border-border p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wide">
                {tSubmit('step1.selectType')}
              </span>
              {aiType && (
                <Badge variant="outline" className="text-[10px]">
                  {tSubmit('step1.aiSuggested')}: {tType(aiType)}
                </Badge>
              )}
            </div>
            {aiNoResult && (
              <p className="mb-2 text-xs text-muted-foreground">{tSubmit('step1.noAiResult')}</p>
            )}
            <div data-testid="category-grid" className="grid grid-cols-2 gap-2">
              {PROBLEM_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  data-selected={selectedType === type}
                  onClick={() => setSelectedType(type)}
                  className={cn(
                    'rounded-sm border px-3 py-2 text-sm transition-colors text-left',
                    selectedType === type
                      ? 'border-primary bg-primary text-primary-foreground'
                      : type === aiType
                        ? 'border-primary/50 bg-primary/10 hover:bg-primary/20'
                        : 'border-border hover:bg-muted/50',
                  )}
                >
                  {tType(type)}
                </button>
              ))}
            </div>
            {selectedType === 'other' && (
              <p className="mt-2 text-xs text-muted-foreground">{tSubmit('step1.otherHint')}</p>
            )}
          </div>
        )}
      </div>

      {/* RIGHT: Location + Description + Submit */}
      <div className="flex flex-[0.9] flex-col gap-5 overflow-y-auto p-6 md:p-8">
        {/* Location */}
        <div>
          <span className="mb-2 block font-mono text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            {tSubmit('step2.title')}
          </span>
          <LocationPicker lat={mapLat} lng={mapLng} onChange={(lat2, lng2) => setLocation(lat2, lng2)} />
          <p className="mt-2 text-xs text-muted-foreground">{tSubmit('step2.locationHint')}</p>
        </div>

        <div className="border-t border-border" />

        {/* Description */}
        <div>
          <label htmlFor="description" className="mb-2 block font-mono text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            {tSubmit('step2.description')}
          </label>
          <textarea
            id="description"
            rows={3}
            maxLength={1000}
            placeholder={tSubmit('step2.descriptionPlaceholder')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <p className="mt-1 text-right font-mono text-[10px] text-muted-foreground">
            {t('submit.step2.charCount', { current: description.length, max: 1000 })}
          </p>
        </div>

        {submitError && <p className="text-sm text-destructive">{submitError}</p>}

        {/* Actions */}
        <div className="mt-auto flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => router.push('/map')}>
            {tSubmit('step2.back')}
          </Button>
          <Button
            className="flex-[2]"
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
          >
            {submitting ? tSubmit('step2.submitting') : tSubmit('step2.submit')}
          </Button>
        </div>
      </div>

    </div>
  )
}
