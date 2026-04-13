import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'
import type { NextRequest } from 'next/server'

const intlMiddleware = createMiddleware(routing)

const isProtectedUserRoute = createRouteMatcher([
  '/:locale/profile(.*)',
  '/:locale/submit(.*)',
])

const isModerationRoute = createRouteMatcher([
  '/:locale/moderation(.*)',
])

const isAdminRoute = createRouteMatcher([
  '/:locale/admin(.*)',
])

export default clerkMiddleware(async (auth, req: NextRequest) => {
  const { userId, sessionClaims } = await auth()
  const role = (sessionClaims?.publicMetadata as { role?: string } | undefined)?.role

  const locale = req.nextUrl.pathname.split('/')[1] ?? routing.defaultLocale
  const signInUrl = new URL(`/${locale}/sign-in`, req.url)

  if (isProtectedUserRoute(req) && !userId) {
    signInUrl.searchParams.set('redirect_url', req.url)
    return NextResponse.redirect(signInUrl)
  }

  if (isModerationRoute(req)) {
    if (!userId) return NextResponse.redirect(signInUrl)
    if (role !== 'moderator' && role !== 'admin') {
      return NextResponse.redirect(new URL(`/${locale}`, req.url))
    }
  }

  if (isAdminRoute(req)) {
    if (!userId) return NextResponse.redirect(signInUrl)
    if (role !== 'admin') {
      return NextResponse.redirect(new URL(`/${locale}`, req.url))
    }
  }

  return intlMiddleware(req)
})

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
}
