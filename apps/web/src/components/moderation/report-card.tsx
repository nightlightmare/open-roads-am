'use client'

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { confidenceVariant } from '@/lib/utils'
import type { QueueItem } from '@/stores/moderation-store'

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
    <button
      type="button"
      data-testid="moderation-report-card"
      className="flex w-full cursor-pointer gap-3 rounded-lg border bg-white p-4 shadow-sm transition hover:shadow-md"
      onClick={onClick}
    >
      {report.photo_thumbnail_url ? (
        <Image
          src={report.photo_thumbnail_url}
          alt={t('report.photo')}
          width={80}
          height={80}
          className="flex-shrink-0 rounded object-cover"
        />
      ) : (
        <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded bg-gray-100 text-xs text-gray-400">
          {t('moderation.noPhoto')}
        </div>
      )}

      <div className="flex flex-1 flex-col gap-1 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2">
          <span data-testid="report-problem-type" className="font-medium">{typeLabel(report.problem_type_user)}</span>
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
    </button>
  )
}
