import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { routing } from '@/i18n/routing'

export default async function RootPage() {
  const headersList = await headers()
  const acceptLanguage = headersList.get('accept-language') ?? ''

  const preferred = acceptLanguage
    .split(',')
    .map((part) => (part.split(';')[0] ?? '').trim().toLowerCase().split('-')[0] ?? '')

  const locale =
    preferred.find((lang) => routing.locales.includes(lang as (typeof routing.locales)[number])) ??
    routing.defaultLocale

  redirect(`/${locale}`)
}
