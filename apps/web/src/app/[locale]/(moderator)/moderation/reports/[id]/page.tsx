'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import Image from 'next/image'
import { ApiError } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PROBLEM_TYPES } from '@/lib/constants'
import type { ProblemType } from '@/lib/constants'
import { confidenceVariant } from '@/lib/utils'
import { useModerationStore } from '@/stores/moderation-store'

export default function ReportDetailPage() {
  const { getToken } = useAuth()
  const router = useRouter()
  const params = useParams()
  const locale = (params.locale as string | undefined) ?? 'hy'
  const reportId = params.id as string
  const t = useTranslations('moderation')
  const tMap = useTranslations('map')
  const tErrors = useTranslations('errors')
  const tReport = useTranslations('report')
  const tType = useTranslations('report.problemType')

  const typeLabel = (type: string | null) => (type ? tType(type as Parameters<typeof tType>[0]) : '—')

  const [overrideType, setOverrideType] = useState<ProblemType | ''>('')
  const [rejectionReason, setRejectionReason] = useState('')
  const actionTakenRef = useRef(false)

  const {
    currentReport,
    reportLoading,
    reportError,
    reportLocked,
    actionLoading,
    actionError,
    openReport,
    stopHeartbeat,
    releaseLock,
    approveReport,
    rejectReport,
  } = useModerationStore()

  useEffect(() => {
    void openReport(getToken, reportId, {
      locked: t('unknownModerator'),
      error: tErrors('failedToOpenReport'),
    })

    return () => {
      stopHeartbeat()
      if (!actionTakenRef.current) {
        void getToken().then((tk) => void releaseLock(tk ?? '', reportId))
      }
    }
  }, [reportId, openReport, stopHeartbeat, releaseLock, getToken, t, tErrors])

  const handleApprove = async () => {
    const token = await getToken()
    const ok = await approveReport(token ?? '', reportId, overrideType || null, {
      error: (err) =>
        err instanceof ApiError
          ? tErrors('errorWithCode', { status: err.status, code: err.code })
          : tErrors('failedToApprove'),
    })
    if (ok) {
      actionTakenRef.current = true
      router.push(`/${locale}/moderation`)
    }
  }

  const handleReject = async () => {
    if (!rejectionReason.trim()) return
    const token = await getToken()
    const ok = await rejectReport(token ?? '', reportId, rejectionReason, {
      error: (err) =>
        err instanceof ApiError
          ? tErrors('errorWithCode', { status: err.status, code: err.code })
          : tErrors('failedToReject'),
    })
    if (ok) {
      actionTakenRef.current = true
      router.push(`/${locale}/moderation`)
    }
  }

  if (reportLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        {tMap('loading')}
      </div>
    )
  }

  if (reportLocked) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-yellow-800">
          {t('lockedBy', {
            name: reportLocked.locked_by_display_name,
            time: reportLocked.lock_expires_at
              ? new Date(reportLocked.lock_expires_at).toLocaleTimeString()
              : '',
          })}
        </div>
        <Button variant="outline" onClick={() => router.push(`/${locale}/moderation`)}>
          {t('backToQueue')}
        </Button>
      </div>
    )
  }

  if (reportError) {
    return (
      <div className="space-y-4">
        <p className="text-destructive">{reportError}</p>
        <Button variant="outline" onClick={() => router.push(`/${locale}/moderation`)}>
          {t('backToQueue')}
        </Button>
      </div>
    )
  }

  if (!currentReport) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">{tErrors('reportNotFound')}</p>
        <Button variant="outline" onClick={() => router.push(`/${locale}/moderation`)}>
          {t('backToQueue')}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => router.push(`/${locale}/moderation`)}>
          {t('backToQueue')}
        </Button>
        <h1 className="text-xl font-bold">
          {t('reportTitle', { id: currentReport.id.slice(0, 8) })}
        </h1>
      </div>

      {currentReport.photo_url && (
        <Image
          src={currentReport.photo_url}
          alt={tReport('photo')}
          width={0}
          height={0}
          sizes="100vw"
          className="max-h-80 w-full rounded-lg object-cover"
        />
      )}

      <div className="space-y-3 rounded-lg border bg-white p-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{typeLabel(currentReport.problem_type_user)}</Badge>
          {currentReport.problem_type_ai && (
            <Badge variant="info">
              {tReport('aiPrefix')}: {typeLabel(currentReport.problem_type_ai)}
            </Badge>
          )}
          {currentReport.ai_confidence !== null && (
            <Badge variant={confidenceVariant(currentReport.ai_confidence)}>
              {t('aiConfidence')}: {Math.round(currentReport.ai_confidence * 100)}%
            </Badge>
          )}
        </div>
        {currentReport.description && <p className="text-sm">{currentReport.description}</p>}
        {currentReport.address_raw && (
          <p className="text-sm text-muted-foreground">{currentReport.address_raw}</p>
        )}
        <p className="text-xs text-gray-400">
          {new Date(currentReport.created_at).toLocaleString('ru-RU')}
        </p>
      </div>

      <div className="space-y-4 rounded-lg border bg-white p-4">
        {actionError && <p className="text-sm text-destructive">{actionError}</p>}

        <div className="space-y-3">
          <h2 className="font-semibold">{t('approve')}</h2>
          <div>
            <label htmlFor="override-type" className="mb-1 block text-sm text-muted-foreground">
              {t('overrideType')}
            </label>
            <select
              id="override-type"
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={overrideType}
              onChange={(e) => setOverrideType(e.target.value as ProblemType | '')}
            >
              <option value="">{t('noChanges')}</option>
              {PROBLEM_TYPES.map((type) => (
                <option key={type} value={type}>
                  {typeLabel(type)}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={() => void handleApprove()} disabled={actionLoading}>
            {t('approve')}
          </Button>
        </div>

        <hr />

        <div className="space-y-3">
          <h2 className="font-semibold">{t('reject')}</h2>
          <div>
            <label htmlFor="rejection-reason" className="mb-1 block text-sm text-muted-foreground">
              {t('rejectionReason')}
            </label>
            <textarea
              id="rejection-reason"
              className="w-full rounded-md border px-3 py-2 text-sm"
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder={t('reasonPlaceholder')}
            />
          </div>
          <Button
            variant="destructive"
            onClick={() => void handleReject()}
            disabled={actionLoading || !rejectionReason.trim()}
          >
            {t('reject')}
          </Button>
        </div>
      </div>
    </div>
  )
}
