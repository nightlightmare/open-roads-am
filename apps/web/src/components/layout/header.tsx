'use client'

import { useTranslations } from 'next-intl'
import { useParams } from 'next/navigation'
import { useAuth, UserButton } from '@clerk/nextjs'
import { Globe, Plus } from 'lucide-react'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { routing } from '@/i18n/routing'

const LOCALE_LABELS: Record<string, string> = {
  hy: 'Հայերեն',
  ru: 'Русский',
  en: 'English',
}

export function Header() {
  const t = useTranslations('nav')
  const { isSignedIn, sessionClaims } = useAuth()
  const role = (sessionClaims?.publicMetadata as { role?: string } | undefined)?.role
  const pathname = usePathname()
  const router = useRouter()
  const params = useParams()
  const currentLocale = (params.locale as string | undefined) ?? routing.defaultLocale

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="cursor-pointer text-lg font-bold text-primary hover:opacity-80 transition-opacity">
            open-road.am
          </Link>
          <div className="hidden items-center gap-1 sm:flex">
            {(role === 'moderator' || role === 'admin') && (
              <Link href="/moderation" className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'cursor-pointer' })}>
                {t('moderation')}
              </Link>
            )}
            {role === 'admin' && (
              <Link href="/admin" className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'cursor-pointer' })}>
                {t('admin')}
              </Link>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isSignedIn && (
            <Link href="/submit" className={buttonVariants({ size: 'sm', className: 'cursor-pointer gap-1.5' })}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">{t('reportProblem')}</span>
            </Link>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="cursor-pointer gap-1.5">
                <Globe className="h-4 w-4" />
                <span className="hidden sm:inline">{LOCALE_LABELS[currentLocale] ?? currentLocale}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {routing.locales.map((locale) => (
                <DropdownMenuItem
                  key={locale}
                  onClick={() => router.replace(pathname, { locale })}
                  className={`cursor-pointer ${locale === currentLocale ? 'bg-accent' : ''}`}
                >
                  {LOCALE_LABELS[locale] ?? locale}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {isSignedIn ? (
            <>
              <Link href="/profile" className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'hidden cursor-pointer sm:inline-flex' })}>
                {t('profile')}
              </Link>
              <UserButton />
            </>
          ) : (
            <Link href="/sign-in" className={buttonVariants({ size: 'sm', className: 'cursor-pointer' })}>
              {t('signIn')}
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
