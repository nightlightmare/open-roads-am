'use client'

import { useTranslations } from 'next-intl'
import { useAuth, UserButton } from '@clerk/nextjs'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function Header() {
  const t = useTranslations('nav')
  const { isSignedIn, sessionClaims } = useAuth()
  const params = useParams()
  const locale = (params.locale as string | undefined) ?? 'hy'
  const role = (sessionClaims?.publicMetadata as { role?: string } | undefined)?.role

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href={`/${locale}`} className="text-lg font-bold text-primary">
            open-road.am
          </Link>
          {(role === 'moderator' || role === 'admin') && (
            <Link
              href={`/${locale}/moderation`}
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {t('moderation')}
            </Link>
          )}
          {role === 'admin' && (
            <Link
              href={`/${locale}/admin`}
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {t('admin')}
            </Link>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isSignedIn ? (
            <>
              <Link href={`/${locale}/profile`}>
                <Button variant="ghost" size="sm">
                  {t('profile')}
                </Button>
              </Link>
              <UserButton />
            </>
          ) : (
            <Link href={`/${locale}/sign-in`}>
              <Button size="sm">{t('signIn')}</Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
