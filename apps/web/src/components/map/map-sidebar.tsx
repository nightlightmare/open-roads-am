'use client'

import { useTranslations } from 'next-intl'
import { ImageIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useMapStore } from '@/stores/map-store'
import { PROBLEM_TYPES } from '@/lib/constants'
import { ProblemTypeIcon } from '@/lib/problem-type-icons'

const STATUS_CHIPS = [
  { status: 'approved', activeClass: 'bg-status-new border-status-new text-white' },
  { status: 'in_progress', activeClass: 'bg-status-work border-status-work text-white' },
  { status: 'resolved', activeClass: 'bg-status-done border-status-done text-white' },
] as const

interface ReportListItem {
  id: string
  status: string
  problem_type: string | null
  address_raw: string | null
  confirmation_count: number
  created_at: string
}

interface MapSidebarProps {
  reports?: ReportListItem[]
}

export function MapSidebar({ reports = [] }: MapSidebarProps) {
  const t = useTranslations('map')
  const tType = useTranslations('report.problemType')
  const tStatus = useTranslations('report.status')
  const { filters, setFilters } = useMapStore()

  const toggleType = (type: string) => {
    const current = filters.problemTypes
    if (current.includes(type)) {
      setFilters({ problemTypes: current.filter((t) => t !== type) })
    } else {
      setFilters({ problemTypes: [...current, type] })
    }
  }

  const isTypeActive = (type: string) =>
    filters.problemTypes.length === 0 || filters.problemTypes.includes(type)

  return (
    <>
      {/* Filters */}
      <div className="border-b border-border p-5">
        <div>
          <div className="mb-2.5 flex items-center justify-between">
            <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              {t('filters.title')}
            </span>
            <button
              type="button"
              onClick={() => setFilters({ activeStatuses: ['approved', 'in_progress'], problemTypes: [] })}
              className="border-b border-dotted border-muted-foreground font-mono text-[10px] text-muted-foreground hover:border-foreground hover:text-foreground"
            >
              {t('reset')}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_CHIPS.map((chip) => {
              const isActive = filters.activeStatuses.includes(chip.status)
              return (
                <button
                  key={chip.status}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => {
                    const current = filters.activeStatuses
                    const next = isActive
                      ? current.filter((s) => s !== chip.status)
                      : [...current, chip.status]
                    setFilters({ activeStatuses: next })
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    isActive
                      ? chip.activeClass
                      : 'border-border bg-background text-muted-foreground hover:border-foreground hover:text-foreground'
                  }`}
                >
                  {tStatus(chip.status)}
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2.5">
            <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              {t('filters.problemType')}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PROBLEM_TYPES.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={isTypeActive(key)}
                onClick={() => toggleType(key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  isTypeActive(key)
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-background text-muted-foreground hover:border-foreground hover:text-foreground'
                }`}
              >
                <ProblemTypeIcon type={key} size={12} />
                {tType(key)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Report list */}
      <div>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-5 py-3">
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {t('listTitle')}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {t('visible', { count: reports.length })}
          </span>
        </div>
        <div role="list">
          {reports.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              {t('noReports')}
            </div>
          ) : (
            reports.map((report) => (
              <div
                key={report.id}
                role="listitem"
                className="grid cursor-pointer grid-cols-[56px_1fr] gap-3 border-b border-border/50 px-5 py-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex h-[42px] w-[56px] items-center justify-center rounded bg-muted/50 text-muted-foreground">
                  <ImageIcon className="h-[18px] w-[18px]" strokeWidth={1.4} />
                </div>
                <div className="min-w-0">
                  <h3 className="mb-0.5 line-clamp-2 text-[13px] font-medium leading-snug">
                    {report.problem_type ? tType(report.problem_type) : '—'} · {report.address_raw ?? '—'}
                  </h3>
                  <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                    <Badge variant="outline" className="h-auto px-1.5 py-0 text-[10px]">
                      {tStatus(report.status)}
                    </Badge>
                    <span>·</span>
                    <span>{t('confirms', { count: report.confirmation_count })}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
