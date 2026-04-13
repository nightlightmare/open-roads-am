'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { apiFetch, ApiError } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const PROBLEM_TYPES = [
  'pothole',
  'damaged_barrier',
  'missing_marking',
  'damaged_sign',
  'hazard',
  'broken_light',
  'missing_ramp',
  'other',
] as const

type ProblemType = (typeof PROBLEM_TYPES)[number]

interface QueueItem {
  id: string
  status: string
  problem_type_user: string | null
  problem_type_ai: string | null
  ai_confidence: number | null
  description: string | null
  latitude: number
  longitude: number
  address_raw: string | null
  photo_url: string | null
  photo_thumbnail_url: string | null
  confirmation_count: number
  created_at: string
}

interface QueueResponse {
  reports: QueueItem[]
  cursor: string | null
  total_pending: number
}

interface LockConflict {
  locked_by_display_name: string
  lock_expires_at: string
}

function confidenceVariant(confidence: number | null): 'success' | 'warning' | 'destructive' {
  if (confidence === null) return 'warning'
  if (confidence >= 0.8) return 'success'
  if (confidence >= 0.5) return 'warning'
  return 'destructive'
}

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

  const typeLabel = (type: string | null) => {
    if (!type) return '—'
    return tType(type as Parameters<typeof tType>[0])
  }

  const [report, setReport] = useState<QueueItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [locked, setLocked] = useState<LockConflict | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Action state
  const [overrideType, setOverrideType] = useState<ProblemType | ''>('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Track if action was taken (to skip lock release on unmount)
  const actionTakenRef = useRef(false)

  // Fetch report detail after opening
  const fetchReport = async (token: string | null): Promise<QueueItem | null> => {
    const data = await apiFetch<QueueResponse>(
      '/api/v1/moderation/queue',
      { params: { status: 'under_review', limit: 100 } },
      token ?? undefined,
    )
    return data.reports.find((r) => r.id === reportId) ?? null
  }

  useEffect(() => {
    let heartbeatId: ReturnType<typeof setInterval> | null = null

    const openReport = async () => {
      const token = await getToken()
      try {
        await apiFetch<unknown>(
          `/api/v1/moderation/reports/${reportId}/open`,
          { method: 'POST' },
          token ?? undefined,
        )

        const found = await fetchReport(token)
        setReport(found)

        // Heartbeat every 5 minutes
        heartbeatId = setInterval(async () => {
          const tk = await getToken()
          try {
            await apiFetch<unknown>(
              `/api/v1/moderation/reports/${reportId}/open`,
              { method: 'POST' },
              tk ?? undefined,
            )
          } catch {
            // ignore heartbeat errors
          }
        }, 5 * 60 * 1000)
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          // Parse lock conflict details – re-open to get the body via apiFetch
          try {
            await apiFetch<LockConflict>(
              `/api/v1/moderation/reports/${reportId}/open`,
              { method: 'POST' },
              token ?? undefined,
            )
            // Should not reach here (always 409), use fallback
            setLocked({ locked_by_display_name: t('unknownModerator'), lock_expires_at: '' })
          } catch (innerErr) {
            if (innerErr instanceof ApiError && innerErr.status === 409) {
              // ApiError doesn't carry body; use fallback with error code info
              setLocked({ locked_by_display_name: t('unknownModerator'), lock_expires_at: '' })
            } else {
              setLocked({ locked_by_display_name: t('unknownModerator'), lock_expires_at: '' })
            }
          }
        } else {
          setError(tErrors('failedToOpenReport'))
        }
      } finally {
        setLoading(false)
      }
    }

    void openReport()

    return () => {
      if (heartbeatId !== null) clearInterval(heartbeatId)

      // Release lock on unmount if no action taken
      if (!actionTakenRef.current) {
        void getToken().then((tk) => {
          void apiFetch<unknown>(
            `/api/v1/moderation/reports/${reportId}/lock`,
            { method: 'DELETE' },
            tk ?? undefined,
          ).catch(() => undefined)
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId])

  const handleApprove = async () => {
    setActionLoading(true)
    setActionError(null)
    const token = await getToken()
    try {
      const body: { problem_type_final?: string } = {}
      if (overrideType) body.problem_type_final = overrideType
      await apiFetch<unknown>(
        `/api/v1/moderation/reports/${reportId}/approve`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
        token ?? undefined,
      )
      actionTakenRef.current = true
      router.push(`/${locale}/moderation`)
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(tErrors('errorWithCode', { status: err.status, code: err.code }))
      } else {
        setActionError(tErrors('failedToApprove'))
      }
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      setActionError(t('reasonRequired'))
      return
    }
    setActionLoading(true)
    setActionError(null)
    const token = await getToken()
    try {
      await apiFetch<unknown>(
        `/api/v1/moderation/reports/${reportId}/reject`,
        {
          method: 'POST',
          body: JSON.stringify({ rejection_reason: rejectionReason }),
        },
        token ?? undefined,
      )
      actionTakenRef.current = true
      router.push(`/${locale}/moderation`)
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(tErrors('errorWithCode', { status: err.status, code: err.code }))
      } else {
        setActionError(tErrors('failedToReject'))
      }
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        {tMap('loading')}
      </div>
    )
  }

  if (locked) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-yellow-800">
          {t('lockedBy', {
            name: locked.locked_by_display_name,
            time: locked.lock_expires_at
              ? new Date(locked.lock_expires_at).toLocaleTimeString()
              : '',
          })}
        </div>
        <Button variant="outline" onClick={() => router.push(`/${locale}/moderation`)}>
          {t('backToQueue')}
        </Button>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" onClick={() => router.push(`/${locale}/moderation`)}>
          {t('backToQueue')}
        </Button>
      </div>
    )
  }

  if (!report) {
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
        <h1 className="text-xl font-bold">{t('reportTitle', { id: report.id.slice(0, 8) })}</h1>
      </div>

      {/* Photo */}
      {report.photo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={report.photo_url}
          alt={tReport('photo')}
          className="max-h-80 w-full rounded-lg object-cover"
        />
      )}

      {/* Details */}
      <div className="space-y-3 rounded-lg border bg-white p-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{typeLabel(report.problem_type_user)}</Badge>
          {report.problem_type_ai && (
            <Badge variant="info">{tReport('aiPrefix')}: {typeLabel(report.problem_type_ai)}</Badge>
          )}
          {report.ai_confidence !== null && (
            <Badge variant={confidenceVariant(report.ai_confidence)}>
              {t('aiConfidence')}: {Math.round(report.ai_confidence * 100)}%
            </Badge>
          )}
        </div>

        {report.description && (
          <p className="text-sm">{report.description}</p>
        )}

        {report.address_raw && (
          <p className="text-sm text-muted-foreground">{report.address_raw}</p>
        )}

        <p className="text-xs text-gray-400">
          {new Date(report.created_at).toLocaleString('ru-RU')}
        </p>
      </div>

      {/* Actions */}
      <div className="space-y-4 rounded-lg border bg-white p-4">
        {actionError && (
          <p className="text-sm text-destructive">{actionError}</p>
        )}

        {/* Approve section */}
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

        {/* Reject section */}
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
