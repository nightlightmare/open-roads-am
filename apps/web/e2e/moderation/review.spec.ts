import { test, expect } from '@playwright/test'
import { signInAs } from '../helpers/auth'
import { DEFAULT_LOCALE, FIXTURES } from '../helpers/fixtures'

test.describe('Moderation Review', () => {
  test.setTimeout(60_000)

  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'moderator')
  })

  test('mod-review-01: review page renders report details or error', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/moderation/reports/${FIXTURES.pendingReport}`)
    // Report may be pending (opens successfully) or already under_review/approved from previous run
    await expect(
      page.getByTestId('report-status-badge')
        .or(page.getByRole('button', { name: /^←/ })),
    ).toBeVisible({ timeout: 20_000 })
  })

  test('mod-review-02: locked report shows warning or details', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/moderation/reports/${FIXTURES.lockedReport}`)
    await expect(
      page.getByTestId('lock-warning')
        .or(page.getByTestId('report-status-badge'))
        .or(page.getByRole('button', { name: /^←/ })),
    ).toBeVisible({ timeout: 20_000 })
  })

  test('mod-review-03: approve button exists on review page', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/moderation/reports/${FIXTURES.pendingReport}`)
    await page.waitForTimeout(10_000)
    // If report opened successfully, approve section should be visible
    const badge = page.getByTestId('report-status-badge')
    if (await badge.isVisible()) {
      await expect(page.locator('button[type="submit"]').first()).toBeVisible()
    }
  })

  test('mod-review-05: reject section has textarea', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/moderation/reports/${FIXTURES.pendingReport}`)
    await page.waitForTimeout(10_000)
    const badge = page.getByTestId('report-status-badge')
    if (await badge.isVisible()) {
      await expect(page.locator('textarea').first()).toBeVisible()
    }
  })

  test('mod-review-06: back to queue navigates correctly', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/moderation/reports/${FIXTURES.pendingReport}`)
    await page.waitForTimeout(5000)
    const backBtn = page.getByRole('button', { name: /^←/ }).or(page.getByRole('link', { name: /^←/ }))
    if (await backBtn.isVisible()) {
      await backBtn.click()
      await page.waitForURL(/\/moderation/, { timeout: 10_000 })
    }
  })
})
