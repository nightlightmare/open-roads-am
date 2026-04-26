'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { PROBLEM_TYPES } from '@/lib/constants'
import { ProblemTypeIcon } from '@/lib/problem-type-icons'

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
  const tType = useTranslations('report.problemType')
  const [legendOpen, setLegendOpen] = useState(true)

  return (
    <>
      {/* Toolbar — top right */}
      <div className="absolute right-4 top-4 z-10 flex flex-col gap-2" role="toolbar" aria-label="Инструменты карты">
        <div className="flex flex-col overflow-hidden rounded border border-border bg-background shadow-sm">
          {toolBtn('Увеличить', () => {}, <path d="M12 5v14M5 12h14" />)}
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
        )}
      </div>
    </>
  )
}
