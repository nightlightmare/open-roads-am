'use client'

import { useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { CLOSED_STATUSES } from '@/lib/constants'
import { useReportConfirmStore } from '@/stores/report-store'

export interface ConfirmButtonProps {
  reportId: string
  initialCount: number
  reportStatus: string
}

export function ConfirmButton({ reportId, initialCount, reportStatus }: ConfirmButtonProps) {
  const { getToken, isSignedIn } = useAuth()
  const router = useRouter()
  const t = useTranslations()
  const { confirmed, count, loading, message, init, toggle } = useReportConfirmStore()

  useEffect(() => {
    init(false, initialCount)
  }, [initialCount, init])

  if (CLOSED_STATUSES.has(reportStatus)) return null

  const handleToggle = async () => {
    if (!isSignedIn) {
      router.push('/sign-in')
      return
    }
    const token = await getToken()
    if (!token) return
    await toggle(token, reportId, {
      alreadyConfirmed: t('errors.alreadyConfirmed'),
      ownReport: t('errors.ownReport'),
      retry: t('errors.retry'),
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {t('report.confirmations', { count })}
        </span>
        <Button
          variant={confirmed ? 'secondary' : 'default'}
          size="sm"
          onClick={() => void handleToggle()}
          disabled={loading}
        >
          {loading ? '...' : confirmed ? t('report.unconfirm') : t('report.confirm')}
        </Button>
      </div>
      {message && (
        <p className="text-sm text-destructive">{message}</p>
      )}
    </div>
  )
}
