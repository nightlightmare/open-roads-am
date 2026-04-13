import { auth } from '@clerk/nextjs/server'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { apiFetch } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface MeResponse {
  clerk_id: string
  display_name: string
  role: string
  stats: {
    reports_submitted: number
    reports_approved: number
    reports_resolved: number
    confirmations_given: number
  }
  member_since: string
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const { getToken } = await auth()
  const token = await getToken()
  const t = await getTranslations('profile')

  const me = await apiFetch<MeResponse>('/api/v1/me', undefined, token ?? undefined)

  const formattedDate = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
    new Date(me.member_since),
  )

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">{me.display_name}</h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="secondary">{me.role}</Badge>
            <span className="text-sm text-muted-foreground">
              {t('memberSince', { date: formattedDate })}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label={t('stats.submitted')} value={me.stats.reports_submitted} />
        <StatCard label={t('stats.approved')} value={me.stats.reports_approved} />
        <StatCard label={t('stats.resolved')} value={me.stats.reports_resolved} />
        <StatCard label={t('stats.confirmations')} value={me.stats.confirmations_given} />
      </div>

      <div className="flex gap-4">
        <Link href="/profile/reports">
          <Button variant="outline">{t('tabs.reports')}</Button>
        </Link>
        <Link href="/profile/confirmations">
          <Button variant="outline">{t('tabs.confirmations')}</Button>
        </Link>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-4 text-center">
      <div className="text-3xl font-bold">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
  )
}
