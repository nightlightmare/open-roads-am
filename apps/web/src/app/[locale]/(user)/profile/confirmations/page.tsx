'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useTranslations } from 'next-intl'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { apiFetch } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { BadgeProps } from '@/components/ui/badge'

type ReportStatus =
  | 'pending_review'
  | 'under_review'
  | 'approved'
  | 'in_progress'
  | 'resolved'
  | 'rejected'
  | 'archived'

interface ConfirmationItem {
  report_id: string
  problem_type: string | null
  address_raw: string | null
  photo_thumbnail_url: string | null
  report_status: ReportStatus
  confirmed_at: string
}

interface ConfirmationsResponse {
  confirmations: ConfirmationItem[]
  cursor: string | null
}

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

export default function ProfileConfirmationsPage() {
  const t = useTranslations('profile')
  const tMap = useTranslations('map')
  const tStatus = useTranslations('report.status')
  const tType = useTranslations('report.problemType')
  const { getToken } = useAuth()
  const params = useParams()
  const locale = (params['locale'] as string | undefined) ?? 'hy'
  const router = useRouter()

  const [confirmations, setConfirmations] = useState<ConfirmationItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const fetchConfirmations = useCallback(
    async (nextCursor?: string | null) => {
      const isInitial = nextCursor === undefined
      if (isInitial) setLoading(true)
      else setLoadingMore(true)

      try {
        const token = await getToken()
        const queryParams: Record<string, string | number | boolean | undefined> = {
          limit: 20,
        }
        if (nextCursor) queryParams['cursor'] = nextCursor

        const data = await apiFetch<ConfirmationsResponse>(
          '/api/v1/me/confirmations',
          { params: queryParams },
          token ?? undefined,
        )

        if (isInitial) {
          setConfirmations(data.confirmations)
        } else {
          setConfirmations((prev) => [...prev, ...data.confirmations])
        }
        setCursor(data.cursor)
      } finally {
        if (isInitial) setLoading(false)
        else setLoadingMore(false)
      }
    },
    [getToken],
  )

  useEffect(() => {
    void fetchConfirmations()
  }, [fetchConfirmations])

  const handleLoadMore = () => {
    void fetchConfirmations(cursor)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('tabs.confirmations')}</h1>

      {loading ? (
        <div className="py-12 text-center text-muted-foreground">{tMap('loading')}</div>
      ) : confirmations.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">{t('noConfirmations')}</div>
      ) : (
        <div className="space-y-3">
          {confirmations.map((item) => (
            <button
              key={item.report_id}
              onClick={() => router.push(`/${locale}/reports/${item.report_id}`)}
              className="flex w-full items-center gap-4 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent"
            >
              {item.photo_thumbnail_url !== null && (
                <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md">
                  <Image
                    src={item.photo_thumbnail_url}
                    alt={
                      item.problem_type !== null
                        ? tType(item.problem_type as Parameters<typeof tType>[0])
                        : 'Report photo'
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

      {cursor !== null && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading...' : t('loadMore')}
          </Button>
        </div>
      )}
    </div>
  )
}
