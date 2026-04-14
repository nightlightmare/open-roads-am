import { clerk } from '@clerk/testing/playwright'
import type { Page } from '@playwright/test'

const emails = {
  user: process.env.E2E_USER_EMAIL ?? 'e2e-user@test.open-roads.am',
  moderator: process.env.E2E_MODERATOR_EMAIL ?? 'e2e-moderator@test.open-roads.am',
  admin: process.env.E2E_ADMIN_EMAIL ?? 'e2e-admin@test.open-roads.am',
} as const

export async function signInAs(page: Page, role: 'user' | 'moderator' | 'admin') {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await clerk.signIn({
    page,
    emailAddress: emails[role],
  })

  // Reload to ensure fresh session token with updated publicMetadata
  await page.reload()
  await page.waitForLoadState('networkidle')
}
