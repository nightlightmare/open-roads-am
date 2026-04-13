'use client'

import { useTranslations } from 'next-intl'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface ReportItem {
  id: string
  status: string
  problem_type: string | null
  address_raw: string | null
  confirmation_count: number
  photo_url: string | null
  created_at: string
}

const STATUS_VARIANT: Record<string, 'success' | 'info' | 'warning' | 'outline' | 'secondary'> = {
  approved: 'success',
  in_progress: 'info',
  resolved: 'secondary',
}

export function ReportSidePanel({
  report,
  onClose,
}: {
  report: ReportItem
  onClose: () => void
}) {
  const t = useTranslations()
  const params = useParams()
  const locale = (params.locale as string | undefined) ?? 'hy'

  const statusLabel = t(`report.status.${report.status}` as never)
  const typeLabel = report.problem_type
    ? t(`report.problemType.${report.problem_type}` as never)
    : '—'

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 rounded-t-2xl bg-white shadow-2xl md:bottom-4 md:left-4 md:right-auto md:w-80 md:rounded-2xl">
      <div className="flex items-start justify-between p-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[report.status] ?? 'outline'}>{statusLabel}</Badge>
            <span className="text-sm text-muted-foreground">{typeLabel}</span>
          </div>
          <p className="mt-1 text-sm font-medium">{report.address_raw ?? '—'}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {report.confirmation_count} подтверждений
          </p>
        </div>
        <button
          onClick={onClose}
          className="ml-2 rounded p-1 hover:bg-muted"
          aria-label="Закрыть"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {report.photo_url && (
        <div className="px-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={report.photo_url}
            alt="Фото проблемы"
            className="h-40 w-full rounded-lg object-cover"
          />
        </div>
      )}

      <div className="p-4">
        <Link href={`/${locale}/reports/${report.id}`}>
          <Button className="w-full" size="sm">
            {t('report.viewDetails')}
          </Button>
        </Link>
      </div>
    </div>
  )
}
