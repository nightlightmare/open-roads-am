'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useTranslations } from 'next-intl'
import useSWR from 'swr'
import { useSubmitStore } from '@/stores/submit-store'
import { apiFetch } from '@/lib/api'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { PROBLEM_TYPES, POLL_TIMEOUT_MS } from '@/lib/constants'

interface ClassifyPollResponse {
  status: 'pending' | 'done' | 'failed'
  problem_type_ai: string | null
}

export interface Step1Props {
  onNext: () => void
}

export function Step1({ onNext }: Step1Props) {
  const { getToken } = useAuth()
  const t = useTranslations()
  const tSubmit1 = useTranslations('submit.step1')
  const tType = useTranslations('report.problemType')
  const {
    photoFile,
    jobToken,
    selectedType,
    uploading,
    uploadError,
    setPhoto,
    setSelectedType,
    uploadPhoto,
  } = useSubmitStore()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [aiType, setAiType] = useState<string | null>(null)
  const [aiNoResult, setAiNoResult] = useState(false)
  const [pollStarted, setPollStarted] = useState<number | null>(null)
  const [pollDone, setPollDone] = useState(false)

  // Polling with SWR
  const { data: pollData } = useSWR<ClassifyPollResponse>(
    jobToken && !pollDone
      ? `/api/v1/classify/${jobToken}`
      : null,
    async (url: string) => {
      const token = await getToken()
      return apiFetch<ClassifyPollResponse>(url, undefined, token ?? undefined)
    },
    { refreshInterval: 2000 },
  )

  useEffect(() => {
    if (!pollData) return
    if (pollData.status === 'pending') {
      // Check timeout
      if (pollStarted && Date.now() - pollStarted > POLL_TIMEOUT_MS) {
        setPollDone(true)
        setAiNoResult(true)
      }
      return
    }
    setPollDone(true)
    if (pollData.status === 'done' && pollData.problem_type_ai) {
      setAiType(pollData.problem_type_ai)
      // Pre-select AI suggestion
      setSelectedType(pollData.problem_type_ai)
    } else {
      setAiNoResult(true)
    }
  }, [pollData, pollStarted, setSelectedType])

  const handleFileSelect = useCallback(
    async (file: File) => {
      setAiType(null)
      setAiNoResult(false)
      setPollDone(false)

      const url = URL.createObjectURL(file)
      setPreview(url)
      setPhoto(file)

      await uploadPhoto(getToken, file, { error: t('errors.photoUploadFailed') })
      setPollStarted(Date.now())
    },
    [getToken, setPhoto, uploadPhoto, t],
  )

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void handleFileSelect(file)
  }

  const isPolling = !!jobToken && !pollDone && !uploading
  const showCategories = !uploading && (pollDone || aiNoResult) && !!photoFile

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{tSubmit1('title')}</h1>

      {/* Dropzone */}
      <button
        type="button"
        data-testid="photo-dropzone"
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-muted-foreground transition-colors hover:border-primary hover:text-primary',
          preview ? 'border-solid border-border' : 'border-muted-foreground/30',
        )}
      >
        {preview ? (
          <Image src={preview} alt="Preview" width={0} height={0} sizes="100vw" className="max-h-64 w-auto rounded object-contain" />
        ) : (
          <span className="text-sm">{tSubmit1('dropzone')}</span>
        )}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {uploadError && (
        <p className="text-sm text-destructive">{uploadError}</p>
      )}

      {/* Spinner while uploading */}
      {uploading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="h-4 w-4 animate-spin" />
          {t('map.loading')}
        </div>
      )}

      {/* Polling indicator */}
      {isPolling && (
        <p className="text-sm text-muted-foreground">{tSubmit1('analyzing')}</p>
      )}

      {/* No AI result message */}
      {aiNoResult && (
        <p className="text-sm text-muted-foreground">
          {tSubmit1('noAiResult')}
        </p>
      )}

      {/* Category grid */}
      {showCategories && (
        <div>
          <p className="mb-2 text-sm font-medium">{tSubmit1('selectType')}</p>
          {aiType && (
            <p className="mb-2 text-xs text-muted-foreground">
              {tSubmit1('aiSuggested')}:{' '}
              <span className="font-medium text-foreground">
                {tType(aiType as Parameters<typeof tType>[0])}
              </span>
            </p>
          )}
          <div data-testid="category-grid" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PROBLEM_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedType(type)}
                className={cn(
                  'rounded-md border px-3 py-2 text-sm transition-colors',
                  selectedType === type
                    ? 'border-primary bg-primary text-primary-foreground'
                    : type === aiType
                      ? 'border-primary/50 bg-primary/10 text-foreground hover:bg-primary/20'
                      : 'border-border bg-background hover:bg-accent',
                )}
              >
                {tType(type)}
              </button>
            ))}
          </div>
        </div>
      )}

      <Button
        onClick={onNext}
        disabled={!selectedType}
        className="w-full"
      >
        {tSubmit1('next')}
      </Button>
    </div>
  )
}
