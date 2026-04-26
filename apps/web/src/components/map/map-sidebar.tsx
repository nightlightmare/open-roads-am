'use client'

import { useTranslations } from 'next-intl'
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
  totalInArea?: number
}

export function MapSidebar({ reports = [], totalInArea = 0 }: MapSidebarProps) {
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
      {/* Search & Geo */}
      <div className="border-b border-border p-5">
        <label className="flex items-center gap-2 rounded border border-border bg-muted/50 px-2.5 py-2 transition-colors focus-within:border-foreground">
          <svg className="h-4 w-4 shrink-0 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></svg>
          <input
            type="text"
            placeholder={t('search')}
            className="flex-1 border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">/</span>
        </label>

        <div className="mt-3 flex items-center gap-2">
          <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground">
            <svg className="h-[13px] w-[13px] text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
            {t('myLocation')}
          </button>
          <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground">
            <svg className="h-[13px] w-[13px] text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
            {t('centerYerevan')}
          </button>
        </div>

        {/* Stats strip */}
        <div className="mt-4 grid grid-cols-3 overflow-hidden rounded border border-border bg-muted/50">
          <div className="border-r border-border px-3 py-2.5">
            <div className="text-xl font-semibold tabular-nums leading-tight tracking-tight">{totalInArea || '--'}</div>
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-status-new" />
              {t('new')}
            </div>
          </div>
          <div className="border-r border-border px-3 py-2.5">
            <div className="text-xl font-semibold tabular-nums leading-tight tracking-tight">--</div>
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-status-work" />
              {t('inProgress')}
            </div>
          </div>
          <div className="px-3 py-2.5">
            <div className="text-xl font-semibold tabular-nums leading-tight tracking-tight">--</div>
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-status-done" />
              {t('resolved')}
            </div>
          </div>
        </div>
      </div>

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
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="1" />
                    <circle cx="9" cy="11" r="2" />
                    <path d="M3 17l5-4 4 3 3-2 6 5" />
                  </svg>
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
