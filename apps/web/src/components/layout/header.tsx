'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useParams } from 'next/navigation'
import { useAuth, UserButton } from '@clerk/nextjs'
import { Globe, Menu, Plus } from 'lucide-react'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet'
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
  const [open, setOpen] = useState(false)

  const navLinks = (
    <>
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
        <Link
          href="/moderation"
          className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'cursor-pointer w-full justify-start' })}
          onClick={() => setOpen(false)}
        >
          {t('moderation')}
        </Link>
      )}
      {role === 'admin' && (
        <Link
          href="/admin"
          className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'cursor-pointer w-full justify-start' })}
          onClick={() => setOpen(false)}
        >
          {t('admin')}
        </Link>
      )}
      {isSignedIn && (
        <Link
          href="/profile"
          className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'cursor-pointer w-full justify-start' })}
          onClick={() => setOpen(false)}
        >
          {t('profile')}
        </Link>
      )}
    </>
  )

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="cursor-pointer text-lg font-bold text-primary hover:opacity-80 transition-opacity">
            open-road.am
          </Link>
          <div className="hidden items-center gap-1 md:flex">
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
            <Link href="/submit" className={buttonVariants({ size: 'sm', className: 'hidden cursor-pointer gap-1.5 md:inline-flex' })}>
              <Plus className="h-4 w-4" />
              {t('reportProblem')}
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
              <Link href="/profile" className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'hidden cursor-pointer md:inline-flex' })}>
                {t('profile')}
              </Link>
              <div className="hidden md:block">
                <UserButton />
              </div>
            </>
          ) : (
            <Link href="/sign-in" className={buttonVariants({ size: 'sm', className: 'hidden cursor-pointer md:inline-flex' })}>
              {t('signIn')}
            </Link>
          )}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="cursor-pointer md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <div className="flex flex-col gap-1 p-4 pt-12">
                {navLinks}
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
                  <div className="mt-4 flex items-center gap-3 border-t pt-4">
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
