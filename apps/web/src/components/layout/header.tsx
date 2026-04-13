'use client'

import { useTranslations } from 'next-intl'
import { useParams } from 'next/navigation'
import { useAuth, UserButton } from '@clerk/nextjs'
import { Globe } from 'lucide-react'
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
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-bold text-primary">
            open-road.am
          </Link>
          {(role === 'moderator' || role === 'admin') && (
            <Link href="/moderation" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              {t('moderation')}
            </Link>
          )}
          {role === 'admin' && (
            <Link href="/admin" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              {t('admin')}
            </Link>
          )}
        </div>

        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Globe className="h-4 w-4" />
                {LOCALE_LABELS[currentLocale] ?? currentLocale}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {routing.locales.map((locale) => (
                <DropdownMenuItem
                  key={locale}
                  onClick={() => router.replace(pathname, { locale })}
                  className={locale === currentLocale ? 'bg-accent' : ''}
                >
                  {LOCALE_LABELS[locale] ?? locale}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {isSignedIn ? (
            <>
              <Link href="/profile" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                {t('profile')}
              </Link>
              <UserButton />
            </>
          ) : (
            <Link href="/sign-in" className={buttonVariants({ size: 'sm' })}>
              {t('signIn')}
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
