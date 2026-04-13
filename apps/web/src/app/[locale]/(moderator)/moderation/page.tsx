'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { ApiError } from '@/lib/api'
import { ReportCard } from '@/components/moderation/report-card'
import { useModerationStore } from '@/stores/moderation-store'

export default function ModerationPage() {
  const { getToken } = useAuth()
  const router = useRouter()
  const params = useParams()
  const locale = (params.locale as string | undefined) ?? 'hy'
  const t = useTranslations('moderation')
  const tMap = useTranslations('map')
  const tErrors = useTranslations('errors')

  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)

  const {
    activeTab,
    pendingReports,
    underReviewReports,
    pendingCount,
    loading,
    error,
    setActiveTab,
    setPendingCount,
    loadQueue,
    refetchPending,
  } = useModerationStore()

  const load = useCallback(async () => {
    const token = await getToken()
    await loadQueue(token ?? '', {
      error: (err) =>
        err instanceof ApiError
          ? tErrors('errorWithCode', { status: err.status, code: err.code })
          : tErrors('failedToLoad'),
    })
  }, [getToken, loadQueue, tErrors])

  useEffect(() => {
    void load()
  }, [load])

  // SSE connection for live queue updates
  useEffect(() => {
    let cancelled = false

    const connectSSE = async () => {
      const token = await getToken()
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v1/moderation/feed`,
        { headers: { Authorization: `Bearer ${token ?? ''}` } },
      )
      if (!res.ok || !res.body) return
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
                const tk = await getToken()
                void refetchPending(tk ?? '')
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
  }, [getToken, refetchPending, setPendingCount])

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
        <button className="text-sm text-primary underline" onClick={() => void load()}>
          {tErrors('retry')}
        </button>
      </div>
    )
  }

  const displayReports = activeTab === 'pending' ? pendingReports : underReviewReports

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

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
              onClick={() => router.push(`/${locale}/moderation/reports/${report.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
