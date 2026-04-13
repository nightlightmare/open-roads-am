'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@clerk/nextjs'
import { ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { ROLES } from '@/lib/constants'
import type { Role } from '@/lib/constants'
import { useAdminStore } from '@/stores/admin-store'

export function UsersSection() {
  const t = useTranslations('admin')
  const { getToken } = useAuth()
  const [clerkId, setClerkId] = useState('')
  const [selectedRole, setSelectedRole] = useState<Role>('user')
  const { roleLoading, roleSuccess, roleError, changeRole } = useAdminStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clerkId.trim()) return
    const token = await getToken()
    const ok = await changeRole(token ?? '', clerkId.trim(), selectedRole, {
      success: t('changeRoleSuccess', { role: selectedRole, clerkId: clerkId.trim() }),
      error: (err) =>
        err instanceof ApiError
          ? t('errorWithCode', { status: err.status, code: err.code })
          : t('changeRoleError'),
    })
    if (ok) setClerkId('')
  }

  return (
    <section className="space-y-4 rounded-lg border bg-white p-6">
      <h2 className="text-lg font-semibold">{t('users')}</h2>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
        <div>
          <label htmlFor="clerk-id" className="mb-1 block text-sm font-medium">
            {t('clerkIdLabel')}
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
            {t('role')}
          </label>
          <select
            id="role-select"
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as Role)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </select>
        </div>
        {roleError && <p className="text-sm text-destructive">{roleError}</p>}
        {roleSuccess && <p className="text-sm text-green-600">{roleSuccess}</p>}
        <Button type="submit" disabled={roleLoading || !clerkId.trim()}>
          {roleLoading ? t('saving') : t('changeRole')}
        </Button>
      </form>
    </section>
  )
}
