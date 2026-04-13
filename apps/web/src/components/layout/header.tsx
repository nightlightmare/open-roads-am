'use client'

import { useTranslations } from 'next-intl'
import { useParams } from 'next/navigation'
import { useAuth, UserButton } from '@clerk/nextjs'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { routing } from '@/i18n/routing'

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
            <Link
              href="/moderation"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {t('moderation')}
            </Link>
          )}
          {role === 'admin' && (
            <Link
              href="/admin"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {t('admin')}
            </Link>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-xs font-medium">
            {routing.locales.map((locale) => (
              <button
                key={locale}
                type="button"
                onClick={() => router.replace(pathname, { locale })}
                className={`rounded px-1.5 py-0.5 transition-colors ${
                  locale === currentLocale
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t(locale as Parameters<typeof t>[0])}
              </button>
            ))}
          </div>

          {isSignedIn ? (
            <>
              <Link href="/profile">
                <Button variant="ghost" size="sm">
                  {t('profile')}
                </Button>
              </Link>
              <UserButton />
            </>
          ) : (
            <Link href="/sign-in">
              <Button size="sm">{t('signIn')}</Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
