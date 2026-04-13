import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'

export default async function ModeratorLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const { userId, sessionClaims } = await auth()

  if (!userId) {
    redirect(`/${locale}`)
  }

  const role = (sessionClaims?.publicMetadata as { role?: string } | undefined)?.role

  if (role !== 'moderator' && role !== 'admin') {
    redirect(`/${locale}`)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  )
}
