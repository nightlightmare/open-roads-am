'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Minus, PanelLeft, List } from 'lucide-react'
import { useMapStore } from '@/stores/map-store'
import { PROBLEM_TYPES } from '@/lib/constants'
import { ProblemTypeIcon } from '@/lib/problem-type-icons'
import { MapSearch } from './map-search'

function toolBtn(label: string, onClick: () => void, icon: React.ReactNode, pressed?: boolean) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`grid h-9 w-9 place-items-center border-b border-border text-muted-foreground transition-colors last:border-b-0 hover:bg-muted/50 hover:text-foreground ${
        pressed ? 'bg-primary/10 text-primary' : ''
      }`}
    >
      {icon}
    </button>
  )
}

export function MapOverlays() {
  const tMap = useTranslations('map')
  const tType = useTranslations('report.problemType')
  const { sidebarOpen, toggleSidebar, zoomIn, zoomOut } = useMapStore()
  const [legendOpen, setLegendOpen] = useState(false)

  return (
    <>
      {/* Search — top left */}
      <MapSearch />

      {/* Toolbar — top right */}
      <div className="absolute right-4 top-4 z-10 flex flex-col gap-2" role="toolbar" aria-label={tMap('mapTools')}>
        <div className="flex flex-col overflow-hidden rounded border border-border bg-background shadow-sm">
          {toolBtn(tMap('zoomIn'), () => zoomIn?.(), <Plus className="h-4 w-4" />)}
          {toolBtn(tMap('zoomOut'), () => zoomOut?.(), <Minus className="h-4 w-4" />)}
        </div>

        <div className="flex flex-col overflow-hidden rounded border border-border bg-background shadow-sm">
          {toolBtn(tMap('sidebar'), () => toggleSidebar(), <PanelLeft className="h-4 w-4" />, sidebarOpen)}
          {toolBtn(tMap('legend'), () => setLegendOpen(!legendOpen), <List className="h-4 w-4" />, legendOpen)}
        </div>
      </div>

      {/* Legend — top left, below search */}
      {legendOpen && (
        <div className="absolute left-4 top-[60px] z-10 rounded border border-border bg-background shadow-sm">
          <div className="px-3 py-2">
            <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              {tMap('legend')}
            </span>
          </div>
          <div className="flex flex-col gap-1.5 border-t border-border px-3 py-2.5">
            {PROBLEM_TYPES.map((key) => (
              <div key={key} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[50%_50%_50%_0] bg-foreground text-background" style={{ transform: 'rotate(-45deg)' }}>
                  <span style={{ transform: 'rotate(45deg)', display: 'flex' }}>
                    <ProblemTypeIcon type={key} size={9} />
                  </span>
                </span>
                <span>{tType(key)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
