import { test, expect } from '@playwright/test'
import { signInAs } from '../helpers/auth'
import { DEFAULT_LOCALE, FIXTURES } from '../helpers/fixtures'

test.describe('Moderation Review', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'moderator')
  })

  test('mod-review-01: review page renders report details', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/moderation/reports/${FIXTURES.pendingReport}`)
    await expect(page.getByTestId('report-status-badge')).toBeVisible()
    await expect(page.getByRole('button', { name: /approve/i })).toBeVisible()
  })

  test('mod-review-02: locked report shows warning', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/moderation/reports/${FIXTURES.lockedReport}`)
    await expect(page.getByTestId('lock-warning')).toBeVisible()
    await expect(page.getByRole('link', { name: /back to queue/i })).toBeVisible()
  })

  test('mod-review-03: approve without override submits', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/moderation/reports/${FIXTURES.pendingReport}`)
    await page.getByRole('button', { name: /approve/i }).click()
    await page.waitForURL(/\/moderation$/)
  })

  test('mod-review-05: reject requires reason', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/moderation/reports/${FIXTURES.pendingReport}`)
    const rejectBtn = page.getByRole('button', { name: /reject/i })
    await expect(rejectBtn).toBeDisabled()

    await page.getByPlaceholder(/reason/i).fill('Test rejection reason')
    await expect(rejectBtn).toBeEnabled()
    await rejectBtn.click()
    await page.waitForURL(/\/moderation$/)
  })

  test('mod-review-06: back to queue navigates correctly', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/moderation/reports/${FIXTURES.pendingReport}`)
    await page.getByRole('link', { name: /back to queue/i }).click()
    await page.waitForURL(/\/moderation$/)
  })
})
