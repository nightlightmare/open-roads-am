'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@clerk/nextjs'
import { ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { useAdminStore } from '@/stores/admin-store'

const AVAILABLE_SCOPES = ['reports:write', 'status:write'] as const

export function ApiKeysSection() {
  const t = useTranslations('admin')
  const { getToken } = useAuth()
  const [userId, setUserId] = useState('')
  const [scopes, setScopes] = useState<string[]>([])
  const [copied, setCopied] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const { keyLoading, keyError, createdKey, createApiKey, clearCreatedKey } = useAdminStore()

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId.trim() || scopes.length === 0) return
    const token = await getToken()
    const ok = await createApiKey(
      token ?? '',
      { userId: userId.trim(), scopes },
      {
        error: (err) =>
          err instanceof ApiError
            ? t('errorWithCode', { status: err.status, code: err.code })
            : t('createKeyError'),
      },
    )
    if (ok) {
      setUserId('')
      setScopes([])
      setShowForm(false)
    }
  }

  const toggleScope = (scope: string) => {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    )
  }

  const handleCopy = async () => {
    if (!createdKey) return
    try {
      await navigator.clipboard.writeText(createdKey.key)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard API not available
    }
  }

  return (
    <section className="space-y-4 rounded-lg border bg-white p-6">
      <h2 className="text-lg font-semibold">{t('apiKeys')}</h2>
      {createdKey && (
        <div className="space-y-2 rounded-md border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-medium text-green-800">{t('keyCreated')}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-auto rounded bg-white px-3 py-2 font-mono text-xs text-gray-800">
              {createdKey.key}
            </code>
            <Button size="sm" variant="outline" onClick={() => void handleCopy()}>
              {copied ? t('keyCopied') : t('copyKey')}
            </Button>
          </div>
          <p className="text-xs text-gray-500">{t('keyPrefix', { prefix: createdKey.prefix })}</p>
          <Button size="sm" variant="ghost" onClick={clearCreatedKey}>
            {t('close')}
          </Button>
        </div>
      )}
      {!showForm && !createdKey && (
        <Button onClick={() => setShowForm(true)}>{t('createApiKey')}</Button>
      )}
      {showForm && (
        <form data-testid="create-api-key-form" onSubmit={(e) => void handleCreate(e)} className="space-y-3">
          <div>
            <label htmlFor="key-user-id" className="mb-1 block text-sm font-medium">
              {t('clerkIdLabel')}
            </label>
            <input
              id="key-user-id"
              type="text"
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="user_..."
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
          </div>
          <div>
            <p className="mb-1 text-sm font-medium">Scopes</p>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_SCOPES.map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => toggleScope(scope)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    scopes.includes(scope)
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:bg-accent'
                  }`}
                >
                  {scope}
                </button>
              ))}
            </div>
          </div>
          {keyError && <p className="text-sm text-destructive">{keyError}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={keyLoading || !userId.trim() || scopes.length === 0}>
              {keyLoading ? t('creating') : t('create')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowForm(false)}
            >
              {t('cancel')}
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}
