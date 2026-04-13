'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useTranslations } from 'next-intl'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { apiFetch } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { BadgeProps } from '@/components/ui/badge'

type ReportStatus =
  | 'pending_review'
  | 'under_review'
  | 'approved'
  | 'in_progress'
  | 'resolved'
  | 'rejected'
  | 'archived'

interface StatusHistoryEntry {
  status: ReportStatus
  changed_at: string
  note: string | null
}

interface ReportDetail {
  id: string
  status: ReportStatus
  problem_type: string
  problem_type_user: string | null
  problem_type_ai: string | null
  ai_confidence: number | null
  description: string | null
  latitude: number
  longitude: number
  address_raw: string | null
  photo_url: string | null
  confirmation_count: number
  status_history: StatusHistoryEntry[]
  created_at: string
  updated_at: string
}

function statusVariant(status: ReportStatus): BadgeProps['variant'] {
  switch (status) {
    case 'approved':
      return 'success'
    case 'in_progress':
      return 'info'
    case 'resolved':
      return 'secondary'
    case 'rejected':
      return 'destructive'
    default:
      return 'outline'
  }
}

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

  const [report, setReport] = useState<ReportDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const token = await getToken()
        const data = await apiFetch<ReportDetail>(
          `/api/v1/me/reports/${reportId}`,
          undefined,
          token ?? undefined,
        )
        setReport(data)
      } catch {
        setError(tErrors('failedToLoad'))
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [reportId, getToken])

  const fmt = (dateStr: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(dateStr))

  if (loading) {
    return <div className="py-12 text-center text-muted-foreground">{tMap('loading')}</div>
  }

  if (error || !report) {
    return (
      <div className="py-12 text-center text-muted-foreground">{error ?? tErrors('reportNotFound')}</div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          {tSubmit('back')}
        </Button>
      </div>

      {report.photo_url && (
        <div className="relative aspect-video w-full overflow-hidden rounded-lg">
          <Image
            src={report.photo_url}
            alt={tType(report.problem_type as Parameters<typeof tType>[0])}
            fill
            className="object-cover"
          />
        </div>
      )}

      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">
            {tType(report.problem_type as Parameters<typeof tType>[0])}
          </h1>
          <Badge variant={statusVariant(report.status)}>{tStatus(report.status)}</Badge>
        </div>

        {report.address_raw && (
          <p className="text-muted-foreground">{report.address_raw}</p>
        )}

        {report.description && (
          <p className="text-sm">{report.description}</p>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">{tReport('coordinates')}: </span>
            <span className="text-muted-foreground">
              {report.latitude.toFixed(5)}, {report.longitude.toFixed(5)}
            </span>
          </div>
          <div>
            <span className="font-medium">{tReport('confirmationsCount')}: </span>
            <span className="text-muted-foreground">{report.confirmation_count}</span>
          </div>
          <div>
            <span className="font-medium">{tReport('createdAt')}: </span>
            <span className="text-muted-foreground">{fmt(report.created_at)}</span>
          </div>
          <div>
            <span className="font-medium">{tReport('updatedAt')}: </span>
            <span className="text-muted-foreground">{fmt(report.updated_at)}</span>
          </div>
        </div>

        {(report.problem_type_user !== null || report.problem_type_ai !== null) && (
          <div className="border-t pt-4 space-y-2">
            {report.problem_type_user !== null && (
              <div className="text-sm">
                <span className="font-medium">{tReport('userClassification')}: </span>
                <span className="text-muted-foreground">
                  {tType(report.problem_type_user as Parameters<typeof tType>[0])}
                </span>
              </div>
            )}
            {report.problem_type_ai !== null && (
              <div className="text-sm">
                <span className="font-medium">{tReport('aiClassification')}: </span>
                <span className="text-muted-foreground">
                  {tType(report.problem_type_ai as Parameters<typeof tType>[0])}
                  {report.ai_confidence !== null && (
                    <span className="ml-1">({Math.round(report.ai_confidence * 100)}%)</span>
                  )}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {report.status_history.length > 0 && (
        <div className="rounded-lg border bg-card p-6">
          <h2 className="mb-4 font-semibold">{tReport('statusHistory')}</h2>
          <ol className="space-y-3">
            {report.status_history.map((entry, i) => (
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
