import { test, expect } from '@playwright/test'
import { signInAs } from '../helpers/auth'
import { DEFAULT_LOCALE } from '../helpers/fixtures'

test.describe('User Profile', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'user')
  })

  test('profile-01: profile page renders stats', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/profile`)
    await expect(page.getByTestId('stat-card').first()).toBeVisible()
  })

  test('profile-02: profile page has navigation tabs', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/profile`)
    await expect(page.getByRole('link', { name: /reports|my reports/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /confirm/i })).toBeVisible()
  })
})
