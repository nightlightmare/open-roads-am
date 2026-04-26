'use client'

import { useState } from 'react'
import { useMapStore } from '@/stores/map-store'

const LEGEND_ITEMS = [
  { key: 'pothole', label: 'Выбоина', icon: <path d="M3 17c2-1 4-1 6 0s4 1 6 0 4-1 6 0" />, iconExtra: <ellipse cx="12" cy="14" rx="3" ry="1.5" /> },
  { key: 'missing_marking', label: 'Разметка', icon: <path d="M3 12h2M7 12h2M11 12h2M15 12h2M19 12h2" /> },
  { key: 'damaged_sign', label: 'Знак', icon: <path d="M12 3 L20 9 L17 19 L7 19 L4 9 Z" /> },
  { key: 'hazard', label: 'Опасность', icon: <><path d="M12 3 L21 20 L3 20 Z" /><path d="M12 10v5" /></> },
  { key: 'broken_light', label: 'Свет', icon: <><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></> },
  { key: 'other', label: 'Другое', icon: <><circle cx="12" cy="12" r="9" /><path d="M9 9h.01M15 9h.01" /></> },
]

function toolBtn(label: string, onClick: () => void, iconChildren: React.ReactNode, pressed?: boolean) {
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
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {iconChildren}
      </svg>
    </button>
  )
}

export function MapOverlays() {
  const { zoom } = useMapStore()
  const [legendOpen, setLegendOpen] = useState(true)

  return (
    <>

      {/* Toolbar — top right */}
      <div className="absolute right-4 top-4 z-10 flex flex-col gap-2" role="toolbar" aria-label="Инструменты карты">
        <div className="flex flex-col overflow-hidden rounded border border-border bg-background shadow-sm">
          {toolBtn('Увеличить', () => {}, <path d="M12 5v14M5 12h14" />)}
          <div className="border-b border-t border-border bg-muted/50 px-0 py-1 text-center font-mono text-[10px] text-muted-foreground">
            {Math.round(zoom)}
          </div>
          {toolBtn('Уменьшить', () => {}, <path d="M5 12h14" />)}
        </div>

        <div className="flex flex-col overflow-hidden rounded border border-border bg-background shadow-sm">
          {toolBtn('Моя геолокация', () => {}, <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>)}
          {toolBtn('Легенда', () => setLegendOpen(!legendOpen), <path d="M3 6h18M3 12h18M3 18h12" />, legendOpen)}
        </div>
      </div>

      {/* Legend — top left */}
      <div className="absolute left-4 top-4 z-10 rounded border border-border bg-background shadow-sm">
        <div className="px-3 py-2">
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Легенда
          </span>
        </div>
        {legendOpen && (
          <div className="flex flex-col gap-1.5 border-t border-border px-3 py-2.5">
            {LEGEND_ITEMS.map((item) => (
              <div key={item.key} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[50%_50%_50%_0] bg-foreground text-background" style={{ transform: 'rotate(-45deg)' }}>
                  <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(45deg)' }}>
                    {item.icon}
                    {item.iconExtra}
                  </svg>
                </span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
