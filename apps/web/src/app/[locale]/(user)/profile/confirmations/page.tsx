'use client'

import { useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useTranslations } from 'next-intl'
import { useParams } from 'next/navigation'
import { Link, useRouter } from '@/i18n/navigation'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { statusVariant } from '@/lib/utils'
import { useProfileStore } from '@/stores/profile-store'

export default function ProfileConfirmationsPage() {
  const t = useTranslations('profile')
  const tMap = useTranslations('map')
  const tStatus = useTranslations('report.status')
  const tType = useTranslations('report.problemType')
  const tReport = useTranslations('report')
  const tErrors = useTranslations('errors')
  const { getToken } = useAuth()
  const params = useParams()
  const locale = (params['locale'] as string | undefined) ?? 'hy'
  const router = useRouter()

  const {
    confirmations,
    confirmationsLoading,
    confirmationsLoadingMore,
    confirmationsCursor,
    fetchConfirmations,
    loadMoreConfirmations,
  } = useProfileStore()

  useEffect(() => {
    void fetchConfirmations(getToken, { error: tErrors('failedToLoad') })
  }, [fetchConfirmations, getToken, tErrors])

  const handleLoadMore = () => {
    void loadMoreConfirmations(getToken, { error: tErrors('failedToLoad') })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="cursor-pointer hover:text-foreground transition-colors">←</Link>
        <span>/</span>
        <Link href="/profile" className="cursor-pointer hover:text-foreground transition-colors">{t('title')}</Link>
        <span>/</span>
        <span className="text-foreground">{t('tabs.confirmations')}</span>
      </div>
      <h1 className="text-2xl font-bold">{t('tabs.confirmations')}</h1>

      {confirmationsLoading ? (
        <div className="py-12 text-center text-muted-foreground">{tMap('loading')}</div>
      ) : confirmations.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">{t('noConfirmations')}</div>
      ) : (
        <div className="space-y-3">
          {confirmations.map((item) => (
            <button
              key={item.report_id}
              data-testid="confirmation-item"
              onClick={() => router.push(`/${locale}/reports/${item.report_id}`)}
              className="flex w-full cursor-pointer items-center gap-4 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent"
            >
              {item.photo_thumbnail_url !== null && (
                <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md">
                  <Image
                    src={item.photo_thumbnail_url}
                    alt={
                      item.problem_type !== null
                        ? tType(item.problem_type as Parameters<typeof tType>[0])
                        : tReport('photo')
                    }
                    fill
                    className="object-cover"
                  />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {item.problem_type !== null && (
                    <span className="font-medium">
                      {tType(item.problem_type as Parameters<typeof tType>[0])}
                    </span>
                  )}
                  <Badge variant={statusVariant(item.report_status)}>
                    {tStatus(item.report_status)}
                  </Badge>
                </div>
                {item.address_raw !== null && (
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {item.address_raw}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                    new Date(item.confirmed_at),
                  )}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {confirmationsCursor !== null && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={handleLoadMore} disabled={confirmationsLoadingMore}>
            {confirmationsLoadingMore ? tMap('loading') : t('loadMore')}
          </Button>
        </div>
      )}
    </div>
  )
}
