'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import Image from 'next/image'
import { Link, useRouter } from '@/i18n/navigation'
import { apiFetch, ApiError } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface StatusHistoryEntry {
  status: string
  changed_at: string
  note: string | null
}

interface PublicReport {
  id: string
  status: string
  problem_type: string | null
  description: string | null
  latitude: number
  longitude: number
  address_raw: string | null
  photo_url: string | null
  confirmation_count: number
  status_history: StatusHistoryEntry[]
  created_at: string
  updated_at: string
}

interface ConfirmResponse {
  report_id: string
  confirmation_count: number
}

const STATUS_LABELS: Record<string, string> = {
  pending_review: 'На рассмотрении',
  under_review: 'Изучается',
  approved: 'Одобрено',
  in_progress: 'В работе',
  resolved: 'Решено',
  rejected: 'Отклонено',
  archived: 'Архив',
}

const PROBLEM_TYPE_LABELS: Record<string, string> = {
  pothole: 'Яма',
  damaged_barrier: 'Повреждённое ограждение',
  missing_marking: 'Отсутствие разметки',
  damaged_sign: 'Повреждённый знак',
  hazard: 'Опасность',
  broken_light: 'Неработающий светофор',
  missing_ramp: 'Отсутствие пандуса',
  other: 'Другое',
}

const TIMELINE_STATUSES = new Set(['approved', 'in_progress', 'resolved'])

const CLOSED_STATUSES = new Set(['resolved', 'rejected', 'archived'])

function statusBadgeVariant(
  status: string,
): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' {
  if (status === 'resolved') return 'success'
  if (status === 'rejected' || status === 'archived') return 'destructive'
  if (status === 'approved' || status === 'in_progress') return 'info'
  return 'secondary'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── ConfirmButton ───────────────────────────────────────────────────────────

interface ConfirmButtonProps {
  reportId: string
  initialCount: number
  reportStatus: string
}

function ConfirmButton({ reportId, initialCount, reportStatus }: ConfirmButtonProps) {
  const { getToken, isSignedIn } = useAuth()
  const router = useRouter()
  const [confirmed, setConfirmed] = useState(false)
  const [count, setCount] = useState(initialCount)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (CLOSED_STATUSES.has(reportStatus)) return null

  const handleToggle = async () => {
    if (!isSignedIn) {
      router.push('/sign-in')
      return
    }

    const token = await getToken()
    if (!token) return

    setLoading(true)
    setMessage(null)

    const wasConfirmed = confirmed
    // Optimistic update
    setConfirmed(!wasConfirmed)
    setCount((c) => (wasConfirmed ? c - 1 : c + 1))

    try {
      const result = await apiFetch<ConfirmResponse>(
        `/api/v1/reports/${reportId}/confirm`,
        { method: wasConfirmed ? 'DELETE' : 'POST' },
        token,
      )
      setCount(result.confirmation_count)
    } catch (err) {
      // Revert optimistic update
      setConfirmed(wasConfirmed)
      setCount((c) => (wasConfirmed ? c + 1 : c - 1))

      if (err instanceof ApiError) {
        if (err.code === 'ALREADY_CONFIRMED') {
          setMessage('Вы уже подтвердили этот репорт')
          setConfirmed(true)
        } else if (err.code === 'OWN_REPORT') {
          setMessage('Нельзя подтвердить собственный репорт')
        } else {
          setMessage('Ошибка. Повторите попытку.')
        }
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {count} подтверждений
        </span>
        <Button
          variant={confirmed ? 'secondary' : 'default'}
          size="sm"
          onClick={() => void handleToggle()}
          disabled={loading}
        >
          {loading ? '...' : confirmed ? 'Убрать подтверждение' : 'Подтвердить'}
        </Button>
      </div>
      {message && (
        <p className="text-sm text-destructive">{message}</p>
      )}
    </div>
  )
}

// ─── ReportDetailPage ─────────────────────────────────────────────────────────

export default function ReportDetailPage() {
  const params = useParams()
  const id = params.id as string

  const [report, setReport] = useState<PublicReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchReport = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<PublicReport>(`/api/v1/public/reports/${id}`)
      setReport(data)
    } catch {
      setError('Не удалось загрузить репорт')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void fetchReport()
  }, [fetchReport])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16 text-muted-foreground">
        Загрузка...
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="flex flex-col items-center gap-4 p-16">
        <p className="text-destructive">{error ?? 'Репорт не найден'}</p>
        <Link href="/" className="text-sm text-primary underline">
          ← На карту
        </Link>
      </div>
    )
  }

  const timelineEntries = report.status_history.filter((e) =>
    TIMELINE_STATUSES.has(e.status),
  )

  const govNote = report.status_history
    .filter((e) => e.note)
    .at(-1)

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Back link */}
      <Link
        href="/"
        className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        ← На карту
      </Link>

      {/* Photo */}
      {report.photo_url && (
        <div className="relative mb-6 aspect-video w-full overflow-hidden rounded-lg bg-muted">
          <Image
            src={report.photo_url}
            alt="Фото репорта"
            fill
            className="object-cover"
            sizes="(max-width: 672px) 100vw, 672px"
          />
        </div>
      )}

      {/* Status + Type */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant={statusBadgeVariant(report.status)}>
          {STATUS_LABELS[report.status] ?? report.status}
        </Badge>
        {report.problem_type && (
          <Badge variant="outline">
            {PROBLEM_TYPE_LABELS[report.problem_type] ?? report.problem_type}
          </Badge>
        )}
      </div>

      {/* Address */}
      {report.address_raw && (
        <p className="mb-2 text-sm text-muted-foreground">{report.address_raw}</p>
      )}

      {/* Description */}
      {report.description && (
        <p className="mb-4 text-base">{report.description}</p>
      )}

      {/* Confirm */}
      <div className="mb-6">
        <ConfirmButton
          reportId={report.id}
          initialCount={report.confirmation_count}
          reportStatus={report.status}
        />
      </div>

      {/* Gov agency note */}
      {govNote?.note && (
        <div className="mb-6 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <p className="mb-1 font-semibold">Примечание ведомства</p>
          <p>{govNote.note}</p>
        </div>
      )}

      {/* Status history timeline */}
      {timelineEntries.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            История статусов
          </h2>
          <ol className="relative border-l border-border pl-4">
            {timelineEntries.map((entry, i) => (
              <li key={i} className="mb-4 last:mb-0">
                <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-background bg-primary" />
                <p className="text-sm font-medium">
                  {STATUS_LABELS[entry.status] ?? entry.status}
                </p>
                <time className="text-xs text-muted-foreground">
                  {formatDate(entry.changed_at)}
                </time>
                {entry.note && (
                  <p className="mt-1 text-sm text-muted-foreground">{entry.note}</p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Dates */}
      <p className="text-xs text-muted-foreground">
        Создано: {formatDate(report.created_at)}
      </p>
    </div>
  )
}
