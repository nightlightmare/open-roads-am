'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@clerk/nextjs'
import { ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { useAdminStore } from '@/stores/admin-store'

export function ApiKeysSection() {
  const t = useTranslations('admin')
  const { getToken } = useAuth()
  const [description, setDescription] = useState('')
  const [copied, setCopied] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const { keyLoading, keyError, createdKey, createApiKey, clearCreatedKey } = useAdminStore()

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = await getToken()
    const ok = await createApiKey(token ?? '', description, {
      error: (err) =>
        err instanceof ApiError
          ? t('errorWithCode', { status: err.status, code: err.code })
          : t('createKeyError'),
    })
    if (ok) {
      setDescription('')
      setShowForm(false)
    }
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
        <form onSubmit={(e) => void handleCreate(e)} className="space-y-3">
          <div>
            <label htmlFor="key-description" className="mb-1 block text-sm font-medium">
              {t('keyDescriptionLabel')}
            </label>
            <input
              id="key-description"
              type="text"
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder={t('keyDescriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {keyError && <p className="text-sm text-destructive">{keyError}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={keyLoading}>
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
