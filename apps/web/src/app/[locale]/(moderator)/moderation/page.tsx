'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { apiFetch, ApiError } from '@/lib/api'
import { Badge } from '@/components/ui/badge'

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

function confidenceVariant(confidence: number | null): 'success' | 'warning' | 'destructive' {
  if (confidence === null) return 'warning'
  if (confidence >= 0.8) return 'success'
  if (confidence >= 0.5) return 'warning'
  return 'destructive'
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

interface ReportCardProps {
  report: QueueItem
  onClick: () => void
}

function ReportCard({ report, onClick }: ReportCardProps) {
  const t = useTranslations()
  const tType = useTranslations('report.problemType')

  const typeLabel = (type: string | null) => {
    if (!type) return '—'
    return tType(type as Parameters<typeof tType>[0])
  }

  return (
    <div
      className="flex cursor-pointer gap-3 rounded-lg border bg-white p-4 shadow-sm transition hover:shadow-md"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick()
      }}
    >
      {report.photo_thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={report.photo_thumbnail_url}
          alt={t('report.photo')}
          className="h-20 w-20 flex-shrink-0 rounded object-cover"
        />
      ) : (
        <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded bg-gray-100 text-xs text-gray-400">
          {t('moderation.noPhoto')}
        </div>
      )}

      <div className="flex flex-1 flex-col gap-1 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{typeLabel(report.problem_type_user)}</span>
          {report.problem_type_ai && (
            <Badge variant="info" className="text-xs">
              {t('report.aiPrefix')}: {typeLabel(report.problem_type_ai)}
            </Badge>
          )}
          {report.ai_confidence !== null && (
            <Badge variant={confidenceVariant(report.ai_confidence)} className="text-xs">
              {Math.round(report.ai_confidence * 100)}%
            </Badge>
          )}
        </div>

        {report.address_raw && (
          <p className="truncate text-sm text-muted-foreground">{report.address_raw}</p>
        )}

        <p className="text-xs text-gray-400">{formatDate(report.created_at)}</p>
      </div>
    </div>
  )
}

export default function ModerationPage() {
  const { getToken } = useAuth()
  const router = useRouter()
  const params = useParams()
  const locale = (params.locale as string | undefined) ?? 'hy'
  const t = useTranslations('moderation')
  const tMap = useTranslations('map')
  const tErrors = useTranslations('errors')

  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)

  const [activeTab, setActiveTab] = useState<'pending' | 'under_review'>('pending')
  const [pendingReports, setPendingReports] = useState<QueueItem[]>([])
  const [underReviewReports, setUnderReviewReports] = useState<QueueItem[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchQueue = useCallback(
    async (status: 'pending_review' | 'under_review'): Promise<QueueItem[]> => {
      const token = await getToken()
      const data = await apiFetch<QueueResponse>(
        '/api/v1/moderation/queue',
        { params: { status, limit: 20 } },
        token ?? undefined,
      )
      return data.reports
    },
    [getToken],
  )

  const refetchPending = useCallback(async () => {
    try {
      const reports = await fetchQueue('pending_review')
      setPendingReports(reports)
    } catch {
      // ignore background refetch errors
    }
  }, [fetchQueue])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      const [pendingData, underReviewData] = await Promise.all([
        apiFetch<QueueResponse>(
          '/api/v1/moderation/queue',
          { params: { status: 'pending_review', limit: 20 } },
          token ?? undefined,
        ),
        apiFetch<QueueResponse>(
          '/api/v1/moderation/queue',
          { params: { status: 'under_review', limit: 20 } },
          token ?? undefined,
        ),
      ])
      setPendingReports(pendingData.reports)
      setPendingCount(pendingData.total_pending)
      setUnderReviewReports(underReviewData.reports)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(tErrors('errorWithCode', { status: err.status, code: err.code }))
      } else {
        setError(tErrors('failedToLoad'))
      }
    } finally {
      setLoading(false)
    }
  }, [getToken, tErrors])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  // SSE connection
  useEffect(() => {
    let cancelled = false

    const connectSSE = async () => {
      const token = await getToken()
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v1/moderation/feed`,
        { headers: { Authorization: `Bearer ${token ?? ''}` } },
      )
      if (!res.ok || !res.body) {
        console.error('SSE connection failed:', res.status)
        return
      }
      if (cancelled) return
      const reader = res.body.getReader()
      readerRef.current = reader
      const decoder = new TextDecoder()
      let buffer = ''
      while (!cancelled) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6)) as {
                event: string
                total_pending?: number
              }
              if (event.event === 'new_report') {
                void refetchPending()
              }
              if (event.event === 'queue_count' && event.total_pending !== undefined) {
                setPendingCount(event.total_pending)
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    }

    void connectSSE()
    return () => {
      cancelled = true
      readerRef.current?.cancel().catch(() => undefined)
    }
  }, [getToken, refetchPending])

  const handleCardClick = (reportId: string) => {
    router.push(`/${locale}/moderation/reports/${reportId}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        {tMap('loading')}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <p className="text-destructive">{error}</p>
        <button
          className="text-sm text-primary underline"
          onClick={() => void loadAll()}
        >
          {tErrors('retry')}
        </button>
      </div>
    )
  }

  const displayReports = activeTab === 'pending' ? pendingReports : underReviewReports

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border bg-gray-50 p-1">
        <button
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
            activeTab === 'pending'
              ? 'bg-white shadow text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('pending')}
        >
          {t('tabs.pending')} ({pendingCount})
        </button>
        <button
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
            activeTab === 'under_review'
              ? 'bg-white shadow text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('under_review')}
        >
          {t('tabs.underReview')}
        </button>
      </div>

      {/* Report list */}
      {displayReports.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          {activeTab === 'pending' ? t('noPending') : t('noUnderReview')}
        </div>
      ) : (
        <div className="space-y-3">
          {displayReports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              onClick={() => handleCardClick(report.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
