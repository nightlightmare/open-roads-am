import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { ArrowRight, ArrowUpRight, CircleDot, Sun, AlertTriangle, Signpost, Eye } from 'lucide-react'
import { AudienceTabs } from '@/components/landing/audience-tabs'
import { DemoFeed } from '@/components/landing/demo-feed'

export default function LandingPage() {
  const t = useTranslations('landing')

  return (
    <div className="landing">
      {/* Hero */}
      <section className="border-b border-border py-12 md:py-20">
        <div className="mx-auto grid max-w-[1240px] gap-10 px-4 md:grid-cols-[1.05fr_0.95fr] md:gap-16 md:px-10">
          <div>
            <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-muted-foreground">
              <span className="inline-block h-2 w-2 rounded-full bg-primary" />
              {t('hero.kicker')}
            </span>

            <h1 className="mb-5 text-4xl font-semibold leading-[1.04] tracking-tight text-balance md:text-5xl lg:text-6xl">
              {t('hero.title')}
            </h1>

            <p className="mb-8 max-w-[55ch] text-lg text-muted-foreground text-pretty">
              {t('hero.lede')}
            </p>

            <div className="mb-10 flex flex-wrap gap-3">
              <Link
                href="/submit"
                className="inline-flex items-center gap-2 rounded-sm border-[1.5px] border-foreground bg-foreground px-5 py-3 text-[15px] font-medium text-background transition-colors hover:border-primary hover:bg-primary"
              >
                {t('hero.cta')}
                <ArrowRight className="h-[18px] w-[18px]" />
              </Link>
              <Link
                href="/map"
                className="inline-flex items-center gap-2 rounded-sm border-[1.5px] border-border px-5 py-3 text-[15px] font-medium text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
              >
                {t('hero.ctaSecondary')}
              </Link>
            </div>

            <dl className="grid grid-cols-1 gap-5 border-t border-border pt-5 sm:grid-cols-2">
              <div>
                <dt className="mb-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                  {t('hero.contextLabel')}
                </dt>
                <dd className="text-sm leading-relaxed text-muted-foreground">
                  {t('hero.contextValue')}
                </dd>
              </div>
              <div>
                <dt className="mb-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                  {t('hero.stageLabel')}
                </dt>
                <dd className="text-sm leading-relaxed text-muted-foreground">
                  {t('hero.stageValue')}
                </dd>
              </div>
            </dl>
          </div>

          <aside aria-label={t('hero.feedLabel')}>
            <DemoFeed />
          </aside>
        </div>
      </section>

      {/* Types of problems */}
      <section id="types" className="border-b border-border py-16 md:py-24">
        <div className="mx-auto max-w-[1240px] px-4 md:px-10">
          <header className="mb-10 max-w-[720px]">
            <span className="mb-3 inline-block font-mono text-xs uppercase tracking-widest text-muted-foreground">
              {t('types.eyebrow')}
            </span>
            <h2 className="mb-3 text-3xl font-semibold leading-tight tracking-tight text-balance md:text-4xl lg:text-[clamp(36px,5vw,56px)]">
              {t('types.title')}
            </h2>
            <p className="max-w-[60ch] text-lg text-muted-foreground text-pretty">
              {t('types.lede')}
            </p>
          </header>

          <ul className="grid grid-cols-1 border-l border-t border-border sm:grid-cols-2 lg:grid-cols-3">
            {PROBLEM_TYPES.map((type) => (
              <li
                key={type.key}
                className="group border-b border-r border-border p-6 transition-colors md:p-8 hover:bg-muted/50"
              >
                <span className="mb-4 grid h-11 w-11 place-items-center rounded-sm border-[1.5px] border-foreground text-foreground transition-all group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
                  {type.icon}
                </span>
                <h3 className="mb-2 text-xl font-semibold tracking-tight">
                  {t(`types.items.${type.key}.name`)}
                </h3>
                <p className="mb-4 max-w-[36ch] text-sm leading-relaxed text-muted-foreground">
                  {t(`types.items.${type.key}.desc`)}
                </p>
                <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
                  {t(`types.items.${type.key}.meta`)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Audience */}
      <section id="audience" className="border-b border-border py-16 md:py-24">
        <div className="mx-auto max-w-[1240px] px-4 md:px-10">
          <header className="mb-10 max-w-[720px]">
            <span className="mb-3 inline-block font-mono text-xs uppercase tracking-widest text-muted-foreground">
              {t('audience.eyebrow')}
            </span>
            <h2 className="mb-3 text-3xl font-semibold leading-tight tracking-tight text-balance md:text-4xl lg:text-[clamp(36px,5vw,56px)]">
              {t('audience.title')}
            </h2>
            <p className="max-w-[60ch] text-lg text-muted-foreground text-pretty">
              {t('audience.lede')}
            </p>
          </header>

          <AudienceTabs />
        </div>
      </section>

      {/* API / OSS */}
      <section id="api" className="border-b border-border py-16 md:py-24">
        <div className="mx-auto grid max-w-[1240px] gap-10 px-4 md:grid-cols-[1fr_1.1fr] md:gap-16 md:px-10">
          <div>
            <span className="mb-3 inline-block font-mono text-xs uppercase tracking-widest text-muted-foreground">
              {t('api.eyebrow')}
            </span>
            <h2 className="mb-3 text-3xl font-semibold leading-tight tracking-tight text-balance md:text-4xl lg:text-[clamp(36px,5vw,56px)]">
              {t('api.title')}
            </h2>
            <p className="max-w-[60ch] text-lg text-muted-foreground text-pretty">
              {t('api.lede')}
            </p>

            <ul className="my-6 grid gap-0 border-t border-border">
              {API_POINTS.map((point) => (
                <li
                  key={point.key}
                  className="grid grid-cols-1 gap-1 border-b border-border py-4 sm:grid-cols-[200px_1fr] sm:gap-4"
                >
                  <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                    {t(`api.points.${point.key}.label`)}
                  </span>
                  <span className="text-[15px]">
                    {t(`api.points.${point.key}.value`)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap gap-3">
              <span
                className="inline-flex cursor-default items-center gap-2 rounded-sm border-[1.5px] border-foreground bg-foreground px-4 py-2.5 text-sm font-medium text-background opacity-60"
              >
                {t('api.docsBtn')}
                <ArrowUpRight className="h-4 w-4" />
              </span>
              <span
                className="inline-flex cursor-default items-center gap-2 rounded-sm border-[1.5px] border-border px-4 py-2.5 text-sm font-medium text-muted-foreground opacity-60"
              >
                {t('api.githubBtn')}
              </span>
            </div>
          </div>

          <figure className="overflow-hidden rounded-sm border border-border bg-muted/50" aria-label={t('api.snippetLabel')}>
            <figcaption className="flex items-center gap-3 border-b border-border bg-background px-4 py-3 font-mono text-xs">
              <span className="rounded-sm bg-foreground px-2 py-0.5 tracking-wide text-background">
                GET
              </span>
              <span className="flex-1 overflow-hidden text-ellipsis">api.openroad.am/v1/reports</span>
              <span className="text-muted-foreground">200 OK</span>
            </figcaption>
            <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed">
              <code>{`{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [44.5152, 40.1796]
      },
      "properties": {
        "id":       "OR-A4F12",
        "category": "pothole",
        "severity": "high",
        "status":   "in_progress",
        "confirms": 18,
        "reported": "2026-04-12T08:14:00Z",
        "agency":   "yerevan_municipality"
      }
    }
  ]
}`}</code>
            </pre>
          </figure>
        </div>
      </section>

      {/* CTA */}
      <section id="start" className="border-b border-border bg-muted/50 py-16 md:py-24">
        <div className="mx-auto grid max-w-[1240px] items-center gap-8 px-4 md:grid-cols-[1fr_auto] md:gap-16 md:px-10">
          <div>
            <h2 className="mb-3 text-3xl font-semibold leading-tight tracking-tight text-balance md:text-4xl lg:text-[clamp(36px,5vw,56px)]">
              {t('cta.title')}
            </h2>
            <p className="mb-5 text-lg text-muted-foreground">
              {t('cta.lede')}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/map"
                className="inline-flex items-center gap-2 rounded-sm border-[1.5px] border-foreground bg-foreground px-5 py-3 text-[15px] font-medium text-background transition-colors hover:border-primary hover:bg-primary"
              >
                {t('cta.openMap')}
              </Link>
              <Link
                href="/submit"
                className="inline-flex items-center gap-2 rounded-sm border-[1.5px] border-border px-5 py-3 text-[15px] font-medium text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
              >
                {t('cta.report')}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-16">
        <div className="mx-auto max-w-[1240px] px-4 md:px-10">
          <div className="mb-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_1.4fr]">
            <div>
              <span className="text-base font-semibold tracking-tight">
                OpenRoad<span className="text-primary">.am</span>
              </span>
              <p className="mt-3 max-w-[32ch] text-[13px] leading-relaxed text-muted-foreground">
                {t('footer.bio')}
              </p>
            </div>

            <nav className="flex flex-col gap-2" aria-label={t('footer.platformTitle')}>
              <h4 className="mb-1 font-mono text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                {t('footer.platformTitle')}
              </h4>
              <Link href="/map" className="text-sm text-muted-foreground hover:text-foreground">{t('footer.map')}</Link>
              <Link href="/submit" className="text-sm text-muted-foreground hover:text-foreground">{t('footer.report')}</Link>
            </nav>

            <nav className="flex flex-col gap-2" aria-label={t('footer.devTitle')}>
              <h4 className="mb-1 font-mono text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                {t('footer.devTitle')}
              </h4>
              <span className="text-sm text-muted-foreground">REST API</span>
              <span className="text-sm text-muted-foreground">GitHub (MIT)</span>
            </nav>

            <nav className="flex flex-col gap-2" aria-label={t('footer.projectTitle')}>
              <h4 className="mb-1 font-mono text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                {t('footer.projectTitle')}
              </h4>
              <span className="text-sm text-muted-foreground">{t('footer.about')}</span>
              <span className="text-sm text-muted-foreground">{t('footer.privacy')}</span>
            </nav>

            <div className="flex flex-col gap-2">
              <h4 className="mb-1 font-mono text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                {t('footer.sourcesTitle')}
              </h4>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t('footer.sourceWho')}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t('footer.sourceOsm')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-5">
            <span className="font-mono text-xs text-muted-foreground">
              &copy; 2026 OpenRoad.am &middot; MIT &middot; CC BY 4.0
            </span>
            <span className="font-mono text-xs text-muted-foreground">v0.1 &middot; MVP</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

const PROBLEM_TYPES = [
  {
    key: 'pothole',
    icon: <CircleDot className="h-[22px] w-[22px]" />,
  },
  {
    key: 'marking',
    icon: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h2M7 12h2M11 12h2M15 12h2M19 12h2" /><path d="M3 6h18M3 18h18" opacity=".4" /></svg>,
  },
  {
    key: 'sign',
    icon: <Signpost className="h-[22px] w-[22px]" />,
  },
  {
    key: 'hazard',
    icon: <AlertTriangle className="h-[22px] w-[22px]" />,
  },
  {
    key: 'lighting',
    icon: <Sun className="h-[22px] w-[22px]" />,
  },
  {
    key: 'other',
    icon: <Eye className="h-[22px] w-[22px]" />,
  },
]

const API_POINTS = [
  { key: 'rest' },
  { key: 'codeLicense' },
  { key: 'dataLicense' },
  { key: 'mcp' },
]
