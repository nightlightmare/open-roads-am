'use client'

import { useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { apiFetch, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'

type Role = 'user' | 'moderator' | 'gov_agency' | 'admin'

const ROLES: { value: Role; label: string }[] = [
  { value: 'user', label: 'Пользователь' },
  { value: 'moderator', label: 'Модератор' },
  { value: 'gov_agency', label: 'Гос. ведомство' },
  { value: 'admin', label: 'Администратор' },
]

interface ApiKeyResponse {
  key: string
  prefix: string
}

function UsersSection() {
  const { getToken } = useAuth()
  const [clerkId, setClerkId] = useState('')
  const [selectedRole, setSelectedRole] = useState<Role>('user')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clerkId.trim()) {
      setError('Укажите Clerk ID пользователя')
      return
    }
    setLoading(true)
    setSuccess(null)
    setError(null)
    const token = await getToken()
    try {
      await apiFetch<unknown>(
        `/api/v1/admin/users/${clerkId.trim()}/role`,
        {
          method: 'POST',
          body: JSON.stringify({ role: selectedRole }),
        },
        token ?? undefined,
      )
      setSuccess(`Роль "${selectedRole}" успешно назначена пользователю ${clerkId.trim()}`)
      setClerkId('')
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`Ошибка ${err.status}: ${err.code}`)
      } else {
        setError('Не удалось изменить роль')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="space-y-4 rounded-lg border bg-white p-6">
      <h2 className="text-lg font-semibold">Пользователи</h2>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
        <div>
          <label htmlFor="clerk-id" className="mb-1 block text-sm font-medium">
            Clerk ID пользователя
          </label>
          <input
            id="clerk-id"
            type="text"
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="user_..."
            value={clerkId}
            onChange={(e) => setClerkId(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="role-select" className="mb-1 block text-sm font-medium">
            Роль
          </label>
          <select
            id="role-select"
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as Role)}
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && <p className="text-sm text-green-600">{success}</p>}

        <Button type="submit" disabled={loading}>
          {loading ? 'Сохранение...' : 'Изменить роль'}
        </Button>
      </form>
    </section>
  )
}

function ApiKeysSection() {
  const { getToken } = useAuth()
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdKey, setCreatedKey] = useState<ApiKeyResponse | null>(null)
  const [copied, setCopied] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const token = await getToken()
    try {
      const data = await apiFetch<ApiKeyResponse>(
        '/api/v1/admin/api-keys',
        {
          method: 'POST',
          body: JSON.stringify({ description: description.trim() || undefined }),
        },
        token ?? undefined,
      )
      setCreatedKey(data)
      setDescription('')
      setShowForm(false)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`Ошибка ${err.status}: ${err.code}`)
      } else {
        setError('Не удалось создать ключ')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!createdKey) return
    try {
      await navigator.clipboard.writeText(createdKey.key)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore clipboard errors
    }
  }

  return (
    <section className="space-y-4 rounded-lg border bg-white p-6">
      <h2 className="text-lg font-semibold">API ключи</h2>

      {createdKey && (
        <div className="space-y-2 rounded-md border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-medium text-green-800">
            Ключ создан. Сохраните его — он отображается только один раз!
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-auto rounded bg-white px-3 py-2 text-xs font-mono text-gray-800">
              {createdKey.key}
            </code>
            <Button size="sm" variant="outline" onClick={() => void handleCopy()}>
              {copied ? 'Скопировано!' : 'Копировать'}
            </Button>
          </div>
          <p className="text-xs text-gray-500">Префикс: {createdKey.prefix}</p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setCreatedKey(null)}
          >
            Закрыть
          </Button>
        </div>
      )}

      {!showForm && !createdKey && (
        <Button onClick={() => setShowForm(true)}>Создать ключ</Button>
      )}

      {showForm && (
        <form onSubmit={(e) => void handleCreate(e)} className="space-y-3">
          <div>
            <label htmlFor="key-description" className="mb-1 block text-sm font-medium">
              Описание (необязательно)
            </label>
            <input
              id="key-description"
              type="text"
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Описание ключа..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button type="submit" disabled={loading}>
              {loading ? 'Создание...' : 'Создать'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowForm(false)
                setError(null)
              }}
            >
              Отмена
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Панель администратора</h1>
      <UsersSection />
      <ApiKeysSection />
    </div>
  )
}
