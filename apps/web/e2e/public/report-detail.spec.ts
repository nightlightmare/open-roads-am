import { test, expect } from '@playwright/test'
import { signInAs } from '../helpers/auth'
import { DEFAULT_LOCALE, FIXTURES } from '../helpers/fixtures'

test.describe('Public Report Detail', () => {
  test('report-01: report detail page renders', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/reports/${FIXTURES.approvedReportWithPhoto}`)
    await expect(page.getByTestId('report-status-badge')).toBeVisible()
    await expect(page.getByTestId('report-problem-type')).toBeVisible()
  })

  test('report-02: status history timeline renders', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/reports/${FIXTURES.approvedReportWithPhoto}`)
    await expect(page.getByTestId('status-history')).toBeVisible()
  })

  test('report-03: confirm button hidden for unauthenticated user', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/reports/${FIXTURES.approvedReportWithPhoto}`)
    await expect(page.getByRole('button', { name: /confirm|հաստատել/i })).not.toBeVisible()
  })

  test('report-04: confirm button visible for authenticated user', async ({ page }) => {
    await signInAs(page, 'user')
    await page.goto(`/${DEFAULT_LOCALE}/reports/${FIXTURES.approvedReportWithPhoto}`)
    await expect(page.getByRole('button', { name: /confirm|հաստատել/i })).toBeVisible()
  })

  test('report-05: confirm toggles count', async ({ page }) => {
    // Sign in as admin (not the report owner) to be able to confirm
    await signInAs(page, 'admin')
    await page.goto(`/${DEFAULT_LOCALE}/reports/${FIXTURES.approvedReportWithPhoto}`)
    await page.waitForLoadState('networkidle')

    const countEl = page.getByTestId('confirmation-count')
    await expect(countEl).toBeVisible({ timeout: 10_000 })

    const countBefore = await countEl.textContent()
    // Click the confirm/unconfirm button (next to the count)
    const btn = countEl.locator('..').getByRole('button')
    await btn.click()
    await page.waitForTimeout(2000)
    const countAfter = await countEl.textContent()
    expect(countAfter).not.toBe(countBefore)
  })

  test('report-06: gov agency note renders when present', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/reports/${FIXTURES.approvedReportWithGovNote}`)
    await expect(page.getByTestId('gov-agency-note')).toBeVisible()
  })
})
