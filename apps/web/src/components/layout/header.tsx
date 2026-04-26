'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useParams } from 'next/navigation'
import { useAuth, UserButton } from '@clerk/nextjs'
import { ArrowRight, LogIn, Menu, Moon, Plus, Sun } from 'lucide-react'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { buttonVariants } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet'
import { routing } from '@/i18n/routing'

const LOCALE_SHORT: Record<string, string> = {
  hy: 'ՀԱՅ',
  ru: 'RU',
  en: 'EN',
}

export function Header() {
  const t = useTranslations('nav')
  const { isSignedIn, sessionClaims } = useAuth()
  const role = (sessionClaims?.publicMetadata as { role?: string } | undefined)?.role
  const pathname = usePathname()
  const router = useRouter()
  const params = useParams()
  const currentLocale = (params.locale as string | undefined) ?? routing.defaultLocale
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  const isLanding = pathname === '/'

  useEffect(() => {
    const saved = localStorage.getItem('or-theme')
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setTheme('dark')
      document.documentElement.classList.add('dark')
    }
  }, [])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.classList.toggle('dark', next === 'dark')
    localStorage.setItem('or-theme', next)
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/88 backdrop-blur-[10px] backdrop-saturate-[140%]">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-6 px-4 md:px-10">
        {/* Brand */}
        <Link href="/" className="flex shrink-0 items-center gap-3 text-foreground hover:text-foreground">
          <span className="grid h-8 w-8 place-items-center border-[1.5px] border-foreground">
            <svg viewBox="0 0 32 32" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 26 L14 6 L20 14 L28 26 Z" />
              <path d="M14 6 L14 26" />
              <circle cx="20" cy="14" r="1.5" fill="currentColor" />
            </svg>
          </span>
          <span className="flex flex-col gap-[3px] leading-none">
            <span className="text-base font-semibold tracking-tight">
              OpenRoad<span className="text-primary">.am</span>
            </span>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.04em] text-muted-foreground sm:block">
              MVP &middot; 2026
            </span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="ml-auto hidden items-center gap-6 md:flex" aria-label="Navigation">
          {isLanding ? (
            <>
              <a href="#types" className="relative text-sm text-muted-foreground hover:text-foreground">
                {t('navTypes')}
              </a>
              <a href="#audience" className="relative text-sm text-muted-foreground hover:text-foreground">
                {t('navAudience')}
              </a>
              <a href="#api" className="relative text-sm text-muted-foreground hover:text-foreground">
                {t('navApi')}
              </a>
              <a href="#start" className="relative text-sm text-muted-foreground hover:text-foreground">
                {t('navStart')}
              </a>
            </>
          ) : (
            <>
              {(role === 'moderator' || role === 'admin') && (
                <Link href="/moderation" className="text-sm text-muted-foreground hover:text-foreground">
                  {t('moderation')}
                </Link>
              )}
              {role === 'admin' && (
                <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
                  {t('admin')}
                </Link>
              )}
            </>
          )}
        </nav>

        {/* Tools */}
        <div className={`flex items-center gap-3 ${isLanding ? '' : 'ml-auto md:ml-0'}`}>
          {/* Language switch */}
          <div className="hidden items-center overflow-hidden rounded-sm border border-border sm:inline-flex" role="group" aria-label="Language">
            {routing.locales.map((locale, i) => (
              <button
                key={locale}
                type="button"
                onClick={() => router.replace(pathname, { locale })}
                aria-pressed={locale === currentLocale}
                className={`cursor-pointer px-2.5 py-1.5 font-mono text-[11px] tracking-[0.04em] transition-colors ${
                  i < routing.locales.length - 1 ? 'border-r border-border' : ''
                } ${
                  locale === currentLocale
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {LOCALE_SHORT[locale] ?? locale.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Theme toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            className="grid h-[34px] w-[34px] cursor-pointer place-items-center rounded-sm border border-border text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
            aria-label={t('toggleTheme')}
          >
            {theme === 'dark' ? (
              <Sun className="h-[18px] w-[18px]" />
            ) : (
              <Moon className="h-[18px] w-[18px]" />
            )}
          </button>

          {/* Auth */}
          {isSignedIn ? (
            <div className="flex items-center">
              <UserButton
                appearance={{
                  elements: {
                    userButtonTrigger: 'h-[34px] w-[34px] rounded-sm',
                    avatarBox: 'h-[34px] w-[34px] rounded-sm',
                    avatarImage: 'rounded-sm',
                  },
                }}
              />
            </div>
          ) : (
            <Link
              href="/sign-in"
              className="grid h-[34px] w-[34px] place-items-center rounded-sm border border-border text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
              aria-label={t('signIn')}
            >
              <LogIn className="h-[18px] w-[18px]" />
            </Link>
          )}

          {/* CTA */}
          {pathname === '/map' ? (
            <Link
              href="/submit"
              className="inline-flex items-center gap-2 rounded-sm border-[1.5px] border-primary bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">{t('reportProblem')}</span>
            </Link>
          ) : (
            <Link
              href="/map"
              className="inline-flex items-center gap-2 rounded-sm border-[1.5px] border-foreground bg-foreground px-3.5 py-2 text-[13px] font-medium text-background transition-colors hover:border-primary hover:bg-primary"
            >
              <span className="hidden sm:inline">{t('openMap')}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}

          {/* Mobile menu */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button type="button" className="grid h-9 w-9 cursor-pointer place-items-center rounded-sm border border-border text-muted-foreground hover:text-foreground md:hidden">
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <div className="flex flex-col gap-1 p-4 pt-12">
                {isLanding && (
                  <>
                    <a href="#types" className="w-full rounded-sm px-3 py-2 text-sm text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)}>
                      {t('navTypes')}
                    </a>
                    <a href="#audience" className="w-full rounded-sm px-3 py-2 text-sm text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)}>
                      {t('navAudience')}
                    </a>
                    <a href="#api" className="w-full rounded-sm px-3 py-2 text-sm text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)}>
                      {t('navApi')}
                    </a>
                    <a href="#start" className="w-full rounded-sm px-3 py-2 text-sm text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)}>
                      {t('navStart')}
                    </a>
                    <div className="my-2 border-t border-border" />
                  </>
                )}
                <Link href="/map" className="w-full rounded-sm px-3 py-2 text-sm text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)}>
                  {t('map')}
                </Link>
                {isSignedIn && (
                  <Link
                    href="/submit"
                    className={buttonVariants({ size: 'sm', className: 'cursor-pointer gap-1.5 w-full' })}
                    onClick={() => setOpen(false)}
                  >
                    <Plus className="h-4 w-4" />
                    {t('reportProblem')}
                  </Link>
                )}
                {(role === 'moderator' || role === 'admin') && (
                  <Link href="/moderation" className="w-full rounded-sm px-3 py-2 text-sm text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)}>
                    {t('moderation')}
                  </Link>
                )}
                {role === 'admin' && (
                  <Link href="/admin" className="w-full rounded-sm px-3 py-2 text-sm text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)}>
                    {t('admin')}
                  </Link>
                )}
                {isSignedIn && (
                  <Link href="/profile" className="w-full rounded-sm px-3 py-2 text-sm text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)}>
                    {t('profile')}
                  </Link>
                )}
                {!isSignedIn && (
                  <Link
                    href="/sign-in"
                    className={buttonVariants({ size: 'sm', className: 'cursor-pointer w-full mt-2' })}
                    onClick={() => setOpen(false)}
                  >
                    {t('signIn')}
                  </Link>
                )}
                {isSignedIn && (
                  <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
                    <UserButton />
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
