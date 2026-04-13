import { setupClerkTestingToken } from '@clerk/testing/playwright'
import type { Page } from '@playwright/test'

export async function signInAs(page: Page, _role: 'user' | 'moderator' | 'admin') {
  await setupClerkTestingToken({ page })
  await page.goto('/')
}
