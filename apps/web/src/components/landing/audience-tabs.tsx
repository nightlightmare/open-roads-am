'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

const TABS = ['drivers', 'journalists', 'gov'] as const

export function AudienceTabs() {
  const t = useTranslations('landing.audience')
  const [active, setActive] = useState<(typeof TABS)[number]>('drivers')

  return (
    <>
      <div className="mb-8 flex gap-0 border-b border-border" role="tablist" aria-label={t('title')}>
        {TABS.map((tab, i) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={active === tab}
            tabIndex={active === tab ? 0 : -1}
            onClick={() => setActive(tab)}
            onKeyDown={(e) => {
              const idx = TABS.indexOf(active)
              if (e.key === 'ArrowRight') {
                e.preventDefault()
                const next = TABS[(idx + 1) % TABS.length]!
                setActive(next)
              }
              if (e.key === 'ArrowLeft') {
                e.preventDefault()
                const next = TABS[(idx - 1 + TABS.length) % TABS.length]!
                setActive(next)
              }
            }}
            className={`inline-flex items-baseline gap-3 whitespace-nowrap border-b-2 px-5 py-4 text-[15px] transition-colors -mb-px ${
              active === tab
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span>{t(`tabs.${tab}`)}</span>
          </button>
        ))}
      </div>

      {TABS.map((tab) => (
        <article
          key={tab}
          role="tabpanel"
          hidden={active !== tab}
          className="grid grid-cols-1 gap-8 md:grid-cols-[1.4fr_1fr] md:gap-12"
        >
          <div>
            <p className="mb-5 text-xl font-medium leading-snug tracking-tight text-balance md:text-2xl">
              {t(`panels.${tab}.quote`)}
            </p>
            <ul className="grid gap-3">
              {[0, 1, 2, 3].map((i) => (
                <li
                  key={i}
                  className="relative pl-[22px] text-[15px] leading-relaxed text-muted-foreground before:absolute before:left-0 before:top-[10px] before:h-[1.5px] before:w-3 before:bg-primary"
                >
                  {t(`panels.${tab}.points.${i}`)}
                </li>
              ))}
            </ul>
          </div>
          <aside className="rounded-sm border border-border bg-muted/50 p-5">
            <span className="mb-3 block font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              {t('whatYouGet')}
            </span>
            <ul className="grid gap-3">
              {[0, 1, 2, 3].map((i) => (
                <li
                  key={i}
                  className="border-b border-border/50 pb-3 text-sm leading-snug last:border-0 last:pb-0"
                >
                  {t(`panels.${tab}.benefits.${i}`)}
                </li>
              ))}
            </ul>
          </aside>
        </article>
      ))}
    </>
  )
}
