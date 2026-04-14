import { test, expect } from '@playwright/test'
import { signInAs } from '../helpers/auth'
import { DEFAULT_LOCALE } from '../helpers/fixtures'

test.describe('Authentication', () => {
  test('auth-01: unauthenticated /submit redirects to sign-in', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/submit`)
    await page.waitForURL(/sign-in/)
  })

  test('auth-02: unauthenticated /profile redirects to sign-in', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/profile`)
    await page.waitForURL(/sign-in/)
  })

  test('auth-03: unauthenticated /moderation redirects', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/moderation`)
    await page.waitForURL(/sign-in/)
  })

  test('auth-04: user role cannot access /moderation', async ({ page }) => {
    await signInAs(page, 'user')
    await page.goto(`/${DEFAULT_LOCALE}/moderation`)
    await page.waitForURL(new RegExp(`/${DEFAULT_LOCALE}$`))
    expect(page.url()).not.toContain('/moderation')
  })

  test('auth-05: user role cannot access /admin', async ({ page }) => {
    await signInAs(page, 'user')
    await page.goto(`/${DEFAULT_LOCALE}/admin`)
    await page.waitForURL(new RegExp(`/${DEFAULT_LOCALE}$`))
    expect(page.url()).not.toContain('/admin')
  })
})
