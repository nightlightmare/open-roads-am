'use client'

import { useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useAuth } from '@clerk/nextjs'
import { useTranslations } from 'next-intl'
import { useSubmitStore } from '@/stores/submit-store'
import { useRouter } from '@/i18n/navigation'
import { ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { YEREVAN_LAT, YEREVAN_LNG } from '@/lib/constants'

const LocationPicker = dynamic(
  () => import('@/components/map/location-picker').then((m) => m.LocationPicker),
  { ssr: false },
)

export interface Step2Props {
  onBack: () => void
}

export function Step2({ onBack }: Step2Props) {
  const { getToken } = useAuth()
  const router = useRouter()
  const t = useTranslations()
  const tSubmit2 = useTranslations('submit.step2')

  const {
    lat,
    lng,
    description,
    submitting,
    submitError,
    setLocation,
    setDescription,
    reset,
    submitReport,
  } = useSubmitStore()

  const mapLat = lat ?? YEREVAN_LAT
  const mapLng = lng ?? YEREVAN_LNG

  // Run once on mount — check initial store value so we don't overwrite a location
  // the user already set; setLocation is a stable Zustand action
  const hasInitialLocation = useRef(lat !== null && lng !== null)
  useEffect(() => {
    if (hasInitialLocation.current || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation(pos.coords.latitude, pos.coords.longitude),
      () => setLocation(YEREVAN_LAT, YEREVAN_LNG),
    )
  }, [setLocation])

  const handleMarkerChange = (newLat: number, newLng: number) => {
    setLocation(newLat, newLng)
  }

  const handleSubmit = async () => {
    const token = await getToken()
    const reportId = await submitReport(token ?? '', {
      typeRequired: t('submit.errors.typeRequired'),
      error: (err) => {
        if (err instanceof ApiError) {
          return t('errors.errorWithCode', { status: err.status, code: err.code })
        }
        return t('errors.submitFailed')
      },
    })
    if (reportId) {
      reset()
      router.push(`/profile/reports/${reportId}`)
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
