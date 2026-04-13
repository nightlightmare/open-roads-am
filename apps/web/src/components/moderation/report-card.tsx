'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import type { QueueItem } from '@/stores/moderation-store'

function confidenceVariant(confidence: number | null): 'success' | 'warning' | 'destructive' {
  if (confidence === null) return 'warning'
  if (confidence >= 0.8) return 'success'
  if (confidence >= 0.5) return 'warning'
  return 'destructive'
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export interface ReportCardProps {
  report: QueueItem
  onClick: () => void
}

export function ReportCard({ report, onClick }: ReportCardProps) {
  const t = useTranslations()
  const tType = useTranslations('report.problemType')

  const typeLabel = (type: string | null) => {
    if (!type) return '—'
    return tType(type as Parameters<typeof tType>[0])
  }

  return (
    <div
      className="flex cursor-pointer gap-3 rounded-lg border bg-white p-4 shadow-sm transition hover:shadow-md"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick()
      }}
    >
      {report.photo_thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={report.photo_thumbnail_url}
          alt={t('report.photo')}
          className="h-20 w-20 flex-shrink-0 rounded object-cover"
        />
      ) : (
        <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded bg-gray-100 text-xs text-gray-400">
          {t('moderation.noPhoto')}
        </div>
      )}

      <div className="flex flex-1 flex-col gap-1 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{typeLabel(report.problem_type_user)}</span>
          {report.problem_type_ai && (
            <Badge variant="info" className="text-xs">
              {t('report.aiPrefix')}: {typeLabel(report.problem_type_ai)}
            </Badge>
          )}
          {report.ai_confidence !== null && (
            <Badge variant={confidenceVariant(report.ai_confidence)} className="text-xs">
              {Math.round(report.ai_confidence * 100)}%
            </Badge>
          )}
        </div>

        {report.address_raw && (
          <p className="truncate text-sm text-muted-foreground">{report.address_raw}</p>
        )}

        <p className="text-xs text-gray-400">{formatDate(report.created_at)}</p>
      </div>
    </div>
  )
}
