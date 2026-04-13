'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { Link } from '@/i18n/navigation'
import { Badge } from '@/components/ui/badge'
import { TIMELINE_STATUSES } from '@/lib/constants'
import { usePublicReportStore } from '@/stores/report-store'
import { ConfirmButton } from '@/components/report/confirm-button'

function statusBadgeVariant(
  status: string,
): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' {
  if (status === 'resolved') return 'success'
  if (status === 'rejected' || status === 'archived') return 'destructive'
  if (status === 'approved' || status === 'in_progress') return 'info'
  return 'secondary'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ReportDetailPage() {
  const params = useParams()
  const id = params.id as string
  const t = useTranslations()
  const { report, reportPageLoading, reportPageError, fetchReport } = usePublicReportStore()

  useEffect(() => {
    void fetchReport(id, { error: t('errors.failedToLoad') })
  }, [id, fetchReport, t])

  if (reportPageLoading) {
    return (
      <div className="flex items-center justify-center p-16 text-muted-foreground">
        {t('map.loading')}
      </div>
    )
  }

  if (reportPageError || !report) {
    return (
      <div className="flex flex-col items-center gap-4 p-16">
        <p className="text-destructive">{reportPageError ?? t('errors.reportNotFound')}</p>
        <Link href="/" className="text-sm text-primary underline">
          {t('report.backToMap')}
        </Link>
      </div>
    )
  }

  const timelineEntries = report.status_history.filter((e) =>
    TIMELINE_STATUSES.has(e.status),
  )

  const govNote = report.status_history
    .filter((e) => e.note)
    .at(-1)

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Back link */}
      <Link
        href="/"
        className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        {t('report.backToMap')}
      </Link>

      {/* Photo */}
      {report.photo_url && (
        <div className="relative mb-6 aspect-video w-full overflow-hidden rounded-lg bg-muted">
          <Image
            src={report.photo_url}
            alt={t('report.photo')}
            fill
            className="object-cover"
            sizes="(max-width: 672px) 100vw, 672px"
          />
        </div>
      )}

      {/* Status + Type */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant={statusBadgeVariant(report.status)}>
          {t(`report.status.${report.status}` as Parameters<typeof t>[0])}
        </Badge>
        {report.problem_type && (
          <Badge variant="outline">
            {t(`report.problemType.${report.problem_type}` as Parameters<typeof t>[0])}
          </Badge>
        )}
      </div>

      {/* Address */}
      {report.address_raw && (
        <p className="mb-2 text-sm text-muted-foreground">{report.address_raw}</p>
      )}

      {/* Description */}
      {report.description && (
        <p className="mb-4 text-base">{report.description}</p>
      )}

      {/* Confirm */}
      <div className="mb-6">
        <ConfirmButton
          reportId={report.id}
          initialCount={report.confirmation_count}
          reportStatus={report.status}
        />
      </div>

      {/* Gov agency note */}
      {govNote?.note && (
        <div className="mb-6 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <p className="mb-1 font-semibold">{t('report.govAgencyNote')}</p>
          <p>{govNote.note}</p>
        </div>
      )}

      {/* Status history timeline */}
      {timelineEntries.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t('report.statusHistory')}
          </h2>
          <ol className="relative border-l border-border pl-4">
            {timelineEntries.map((entry, i) => (
              <li key={i} className="mb-4 last:mb-0">
                <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-background bg-primary" />
                <p className="text-sm font-medium">
                  {t(`report.status.${entry.status}` as Parameters<typeof t>[0])}
                </p>
                <time className="text-xs text-muted-foreground">
                  {formatDate(entry.changed_at)}
                </time>
                {entry.note && (
                  <p className="mt-1 text-sm text-muted-foreground">{entry.note}</p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Dates */}
      <p className="text-xs text-muted-foreground">
        {t('report.createdAt')}: {formatDate(report.created_at)}
      </p>
    </div>
  )
}
