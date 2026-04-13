'use client'

import { useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useTranslations } from 'next-intl'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { statusVariant } from '@/lib/utils'
import { useProfileStore } from '@/stores/profile-store'

export default function ProfileReportDetailPage() {
  const tStatus = useTranslations('report.status')
  const tType = useTranslations('report.problemType')
  const tMap = useTranslations('map')
  const tSubmit = useTranslations('submit.step2')
  const tReport = useTranslations('report')
  const tErrors = useTranslations('errors')
  const { getToken } = useAuth()
  const params = useParams()
  const locale = (params['locale'] as string | undefined) ?? 'hy'
  const reportId = params['id'] as string
  const router = useRouter()

  const { profileReport, profileReportLoading, profileReportError, fetchProfileReport } =
    useProfileStore()

  useEffect(() => {
    void fetchProfileReport(getToken, reportId, { error: tErrors('failedToLoad') })
  }, [reportId, getToken, fetchProfileReport, tErrors])

  const fmt = (dateStr: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(dateStr))

  if (profileReportLoading) {
    return <div className="py-12 text-center text-muted-foreground">{tMap('loading')}</div>
  }

  if (profileReportError || !profileReport) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        {profileReportError ?? tErrors('reportNotFound')}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          {tSubmit('back')}
        </Button>
      </div>

      {profileReport.photo_url && (
        <div className="relative aspect-video w-full overflow-hidden rounded-lg">
          <Image
            src={profileReport.photo_url}
            alt={tType(profileReport.problem_type as Parameters<typeof tType>[0])}
            fill
            className="object-cover"
          />
        </div>
      )}

      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">
            {tType(profileReport.problem_type as Parameters<typeof tType>[0])}
          </h1>
          <Badge variant={statusVariant(profileReport.status)}>{tStatus(profileReport.status)}</Badge>
        </div>

        {profileReport.address_raw && (
          <p className="text-muted-foreground">{profileReport.address_raw}</p>
        )}

        {profileReport.description && (
          <p className="text-sm">{profileReport.description}</p>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">{tReport('coordinates')}: </span>
            <span className="text-muted-foreground">
              {profileReport.latitude.toFixed(5)}, {profileReport.longitude.toFixed(5)}
            </span>
          </div>
          <div>
            <span className="font-medium">{tReport('confirmationsCount')}: </span>
            <span className="text-muted-foreground">{profileReport.confirmation_count}</span>
          </div>
          <div>
            <span className="font-medium">{tReport('createdAt')}: </span>
            <span className="text-muted-foreground">{fmt(profileReport.created_at)}</span>
          </div>
          <div>
            <span className="font-medium">{tReport('updatedAt')}: </span>
            <span className="text-muted-foreground">{fmt(profileReport.updated_at)}</span>
          </div>
        </div>

        {(profileReport.problem_type_user !== null || profileReport.problem_type_ai !== null) && (
          <div className="border-t pt-4 space-y-2">
            {profileReport.problem_type_user !== null && (
              <div className="text-sm">
                <span className="font-medium">{tReport('userClassification')}: </span>
                <span className="text-muted-foreground">
                  {tType(profileReport.problem_type_user as Parameters<typeof tType>[0])}
                </span>
              </div>
            )}
            {profileReport.problem_type_ai !== null && (
              <div className="text-sm">
                <span className="font-medium">{tReport('aiClassification')}: </span>
                <span className="text-muted-foreground">
                  {tType(profileReport.problem_type_ai as Parameters<typeof tType>[0])}
                  {profileReport.ai_confidence !== null && (
                    <span className="ml-1">({Math.round(profileReport.ai_confidence * 100)}%)</span>
                  )}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {profileReport.status_history.length > 0 && (
        <div className="rounded-lg border bg-card p-6">
          <h2 className="mb-4 font-semibold">{tReport('statusHistory')}</h2>
          <ol className="space-y-3">
            {profileReport.status_history.map((entry, i) => (
              <li key={i} className="flex items-start gap-3">
                <Badge variant={statusVariant(entry.status)} className="mt-0.5 flex-shrink-0">
                  {tStatus(entry.status)}
                </Badge>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{fmt(entry.changed_at)}</p>
                  {entry.note !== null && (
                    <p className="mt-0.5 text-sm">{entry.note}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
