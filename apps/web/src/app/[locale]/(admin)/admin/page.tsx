'use client'

import { useTranslations } from 'next-intl'
import { UsersSection } from '@/components/admin/users-section'
import { ApiKeysSection } from '@/components/admin/api-keys-section'

export default function AdminPage() {
  const t = useTranslations('admin')
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <UsersSection />
      <ApiKeysSection />
    </div>
  )
}
