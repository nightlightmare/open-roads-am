'use client'

import { useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useTranslations } from 'next-intl'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { BadgeProps } from '@/components/ui/badge'
import type { ReportStatus } from '@/lib/constants'
import { useProfileStore } from '@/stores/profile-store'
import type { StatusFilter } from '@/stores/profile-store'

const STATUS_TABS: StatusFilter[] = [
  'all',
  'pending_review',
  'approved',
  'in_progress',
  'resolved',
  'rejected',
]

function statusVariant(status: ReportStatus): BadgeProps['variant'] {
  switch (status) {
    case 'approved':
      return 'success'
    case 'in_progress':
      return 'info'
    case 'resolved':
      return 'secondary'
    case 'rejected':
      return 'destructive'
    default:
      return 'outline'
  }
}

export default function ProfileReportsPage() {
  const t = useTranslations('profile')
  const tMap = useTranslations('map')
  const tStatus = useTranslations('report.status')
  const tType = useTranslations('report.problemType')
  const tErrors = useTranslations('errors')
  const { getToken } = useAuth()
  const params = useParams()
  const locale = (params['locale'] as string | undefined) ?? 'hy'
  const router = useRouter()

  const {
    reports,
    reportsLoading,
    reportsLoadingMore,
    reportsCursor,
    reportsActiveTab,
    fetchReports,
    loadMoreReports,
    setReportsTab,
  } = useProfileStore()

  useEffect(() => {
    void fetchReports(getToken, reportsActiveTab, { error: tErrors('failedToLoad') })
  }, [reportsActiveTab, fetchReports, getToken, tErrors])

  const handleTabChange = (tab: StatusFilter) => {
    setReportsTab(tab)
  }

  const handleLoadMore = () => {
    void loadMoreReports(getToken, { error: tErrors('failedToLoad') })
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('tabs.reports')}</h1>

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              reportsActiveTab === tab
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            {tab === 'all' ? tMap('filters.all') : tStatus(tab)}
          </button>
        ))}
      </div>

      {reportsLoading ? (
        <div className="py-12 text-center text-muted-foreground">{tMap('loading')}</div>
      ) : reports.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">{t('noReports')}</div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <button
              key={report.id}
              onClick={() => router.push(`/${locale}/profile/reports/${report.id}`)}
              className="flex w-full items-center gap-4 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent"
            >
              {report.photo_thumbnail_url && (
                <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md">
                  <Image
                    src={report.photo_thumbnail_url}
                    alt={tType(report.problem_type as Parameters<typeof tType>[0])}
                    fill
                    className="object-cover"
                  />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {tType(report.problem_type as Parameters<typeof tType>[0])}
                  </span>
                  <Badge variant={statusVariant(report.status)}>{tStatus(report.status)}</Badge>
                </div>
                {report.address_raw && (
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {report.address_raw}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                    new Date(report.created_at),
                  )}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {reportsCursor !== null && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={handleLoadMore} disabled={reportsLoadingMore}>
            {reportsLoadingMore ? tMap('loading') : t('loadMore')}
          </Button>
        </div>
      )}
    </div>
  )
}
