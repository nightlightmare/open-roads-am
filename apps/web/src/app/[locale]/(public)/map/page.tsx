'use client'

import { useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { Plus, ChevronDown } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { MapSidebar } from '@/components/map/map-sidebar'
import { MapOverlays } from '@/components/map/map-overlays'
import { MapPopover } from '@/components/map/map-popover'
import { useMapStore } from '@/stores/map-store'

const MapView = dynamic(
  () => import('@/components/map/map-view').then((m) => m.MapView),
  { ssr: false },
)

export default function MapPage() {
  const t = useTranslations('map')
  const { reports, selected, clearSelection, sidebarOpen } = useMapStore()
  const mapAreaRef = useRef<HTMLElement>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <div className="relative h-[calc(100vh-64px)]">
      {/* Desktop sidebar */}
      <aside className={`absolute left-0 top-0 z-20 hidden h-full w-[380px] overflow-y-auto overflow-x-hidden border-r border-border bg-background transition-transform duration-300 md:block ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <MapSidebar reports={reports} />
      </aside>

      {/* Map */}
      <main ref={mapAreaRef} className={`relative h-full overflow-hidden transition-[margin] duration-300 ${sidebarOpen ? 'md:ml-[380px]' : 'md:ml-0'}`}>
        <MapView />
        <MapOverlays />

        {selected && (
          <MapPopover
            report={selected.report}
            position={selected.screenPosition}
            containerRect={mapAreaRef.current?.getBoundingClientRect() ?? null}
            onClose={clearSelection}
          />
        )}

        {/* Mobile bottom sheet */}
        <div
          className={`absolute inset-x-0 bottom-0 z-20 max-h-[65%] overflow-y-auto rounded-t-2xl border-t border-border bg-background shadow-[0_-4px_16px_rgba(0,0,0,0.08)] transition-transform duration-200 md:hidden ${
            sheetOpen ? 'translate-y-0' : 'translate-y-[calc(100%-88px)]'
          }`}
        >
          {/* Handle */}
          <div className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-border" />

          {/* Toggle header */}
          <button
            type="button"
            onClick={() => setSheetOpen(!sheetOpen)}
            className="flex w-full items-center justify-between px-4 pb-2.5 pt-5"
          >
            <div className="text-left">
              <div className="text-[15px] font-semibold">{t('reports', { count: reports.length })}</div>
              <div className="font-mono text-xs text-muted-foreground">
                {t('pullFilters')}
              </div>
            </div>
            <ChevronDown
              className={`h-[18px] w-[18px] text-muted-foreground transition-transform ${sheetOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Sheet content = same sidebar */}
          <MapSidebar reports={reports} />
        </div>

        {/* Mobile FAB */}
        <Link
          href="/submit"
          className="absolute bottom-6 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-transform hover:-translate-y-0.5 hover:bg-primary/90 md:hidden"
          aria-label={t('reportProblem')}
        >
          <Plus className="h-6 w-6" strokeWidth={2.2} />
        </Link>
      </main>
    </div>
  )
}
