'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ReportListItem } from '@/stores/map-store'

interface MapPopoverProps {
  report: ReportListItem
  position: { x: number; y: number }
  containerRect: DOMRect | null
  onClose: () => void
}

export function MapPopover({ report, position, containerRect, onClose }: MapPopoverProps) {
  const tMap = useTranslations('map')
  const tStatus = useTranslations('report.status')
  const tType = useTranslations('report.problemType')
  const tReport = useTranslations('report')

  if (!containerRect) return null

  const popWidth = 320
  const popEstHeight = 320
  const flipBelow = position.y < popEstHeight + 24
  const clampedX = Math.max(popWidth / 2 + 12, Math.min(containerRect.width - popWidth / 2 - 12, position.x))

  const style: React.CSSProperties = {
    position: 'absolute',
    left: clampedX,
    width: popWidth,
    zIndex: 30,
    ...(flipBelow
      ? { top: position.y + 18, transform: 'translate(-50%, 0)' }
      : { top: position.y, transform: 'translate(-50%, calc(-100% - 18px))' }
    ),
  }

  return (
    <div
      style={style}
      className={`rounded border border-foreground bg-background shadow-xl ${flipBelow ? 'map-popover-below' : 'map-popover-above'}`}
      role="dialog"
      aria-label={tReport('viewDetails')}
    >
      {/* Close */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-2 top-2 z-10 grid h-[26px] w-[26px] place-items-center rounded-sm border border-border bg-background text-muted-foreground hover:border-foreground hover:text-foreground"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>

      {/* Photo placeholder */}
      <div className="relative flex h-[140px] items-center justify-center border-b border-border bg-muted/50 text-muted-foreground">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
          <rect x="3" y="5" width="18" height="14" rx="1" />
          <circle cx="9" cy="11" r="2" />
          <path d="M3 17l5-4 4 3 3-2 6 5" />
        </svg>
        <span className="absolute left-2 top-2 rounded-sm bg-background px-1.5 py-0.5 font-mono text-[10px] tracking-wide">
          {report.id.slice(0, 8)}
        </span>
        <span className="absolute right-10 top-2">
          <Badge variant="outline" className="text-[10px]">
            {tStatus(report.status)}
          </Badge>
        </span>
      </div>

      {/* Body */}
      <div className="p-4">
        <h3 className="mb-1 text-[15px] font-semibold leading-snug">
          {report.problem_type ? tType(report.problem_type) : '—'}
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          {report.address_raw ?? '—'}
        </p>

        {/* Meta */}
        <div className="mb-3 flex gap-3 border-b border-t border-border/50 py-2">
          <div className="flex-1">
            <div className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">{tMap('confirmations')}</div>
            <div className="text-[13px] font-medium">{report.confirmation_count}</div>
          </div>
          <div className="flex-1">
            <div className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">{tMap('created')}</div>
            <div className="text-[13px] font-medium">
              {new Date(report.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" className="flex-1 text-xs">
            {tReport('confirm')}
          </Button>
          <Link
            href={`/reports/${report.id}`}
            className="inline-flex flex-1 items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow hover:bg-primary/90"
          >
            {tReport('viewDetails')}
          </Link>
        </div>
      </div>

      {/* Arrow */}
      <span
        className={`absolute left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-foreground bg-background ${
          flipBelow
            ? '-top-[7px] border-l border-t'
            : '-bottom-[7px] border-b border-r'
        }`}
      />
    </div>
  )
}
