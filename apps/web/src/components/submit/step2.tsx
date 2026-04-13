'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useAuth } from '@clerk/nextjs'
import { useTranslations } from 'next-intl'
import { useSubmitStore } from '@/stores/submit-store'
import { useRouter } from '@/i18n/navigation'
import { apiFetch, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { YEREVAN_LAT, YEREVAN_LNG } from '@/lib/constants'

const LocationPicker = dynamic(
  () => import('@/components/map/location-picker').then((m) => m.LocationPicker),
  { ssr: false },
)

interface CreateReportResponse {
  id: string
}

export interface Step2Props {
  onBack: () => void
}

export function Step2({ onBack }: Step2Props) {
  const { getToken } = useAuth()
  const router = useRouter()
  const t = useTranslations()
  const tSubmit2 = useTranslations('submit.step2')

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
      setSubmitError(t('submit.errors.typeRequired'))
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
        setSubmitError(t('errors.errorWithCode', { status: err.status, code: err.code }))
      } else {
        setSubmitError(t('errors.submitFailed'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{tSubmit2('title')}</h1>

      <div>
        <p className="mb-2 text-sm text-muted-foreground">
          {tSubmit2('locationHint')}
        </p>
        <LocationPicker
          lat={mapLat}
          lng={mapLng}
          onChange={handleMarkerChange}
        />
      </div>

      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium">
          {tSubmit2('description')}
        </label>
        <textarea
          id="description"
          rows={4}
          maxLength={1000}
          placeholder={tSubmit2('descriptionPlaceholder')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="mt-1 text-right text-xs text-muted-foreground">
          {t('submit.step2.charCount', { current: description.length, max: 1000 })}
        </p>
      </div>

      {submitError && (
        <p className="text-sm text-destructive">{submitError}</p>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          {tSubmit2('back')}
        </Button>
        <Button
          onClick={() => void handleSubmit()}
          disabled={submitting}
          className="flex-1"
        >
          {submitting ? tSubmit2('submitting') : tSubmit2('submit')}
        </Button>
      </div>
    </div>
  )
}
