'use client'

import { useTranslations } from 'next-intl'
import { ArrowRight } from 'lucide-react'
import { Link } from '@/i18n/navigation'

export function DemoFeed() {
  const t = useTranslations('landing.hero.feed')

  return (
    <div className="overflow-hidden rounded-sm border border-border bg-muted/50">
      <header className="flex items-center justify-between border-b border-border bg-background px-5 py-4">
        <div className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wide text-muted-foreground">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
          <span>{t('title')}</span>
        </div>
        <span className="rounded-sm border border-primary px-1.5 py-0.5 font-mono text-[10px] tracking-widest text-primary">
          DEMO
        </span>
      </header>

      <ol className="divide-y divide-border/50">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="grid grid-cols-[80px_1fr] gap-4 px-5 py-4 transition-colors hover:bg-muted/80">
            <div className="h-14 w-20 overflow-hidden rounded-sm bg-muted" aria-hidden="true">
              <svg viewBox="0 0 80 56" width="100%" height="100%" className="text-muted-foreground/30">
                <rect width="80" height="56" fill="currentColor" opacity="0.2" />
                <circle cx="40" cy="28" r="12" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.5" />
              </svg>
            </div>
            <div>
              <p className="mb-1 text-sm font-medium leading-snug">{t(`items.${i}.headline`)}</p>
              <p className="flex flex-wrap items-center gap-1 font-mono text-[11px] text-muted-foreground">
                <span className={`inline-flex items-center gap-1.5 uppercase ${STATUS_COLORS[t(`items.${i}.status`) as keyof typeof STATUS_COLORS] ?? ''}`}>
                  <span className="inline-block h-[7px] w-[7px] rounded-full bg-current" />
                  {t(`items.${i}.statusLabel`)}
                </span>
                <span>&middot;</span>
                <span>{t(`items.${i}.time`)}</span>
                <span>&middot;</span>
                <span>{t(`items.${i}.confirms`)}</span>
              </p>
            </div>
          </li>
        ))}
      </ol>

      <footer className="flex items-center justify-between border-t border-border bg-background px-5 py-3">
        <span className="font-mono text-xs text-muted-foreground">{t('demoLabel')}</span>
        <Link
          href="/map"
          className="inline-flex items-center gap-1 border-b border-current font-mono text-xs text-foreground"
        >
          {t('allReports')}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </footer>
    </div>
  )
}

const STATUS_COLORS = {
  new: 'text-red-600',
  work: 'text-amber-600',
  done: 'text-green-700',
}
