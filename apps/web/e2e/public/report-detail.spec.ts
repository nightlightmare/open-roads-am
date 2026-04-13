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
    await signInAs(page, 'user')
    await page.goto(`/${DEFAULT_LOCALE}/reports/${FIXTURES.approvedReportWithPhoto}`)

    const confirmBtn = page.getByRole('button', { name: /confirm|հաստատել/i })
    await expect(confirmBtn).toBeVisible()

    const countBefore = await page.getByTestId('confirmation-count').textContent()
    await confirmBtn.click()
    await page.waitForTimeout(1000)
    const countAfter = await page.getByTestId('confirmation-count').textContent()
    expect(countAfter).not.toBe(countBefore)
  })

  test('report-06: gov agency note renders when present', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/reports/${FIXTURES.approvedReportWithGovNote}`)
    await expect(page.getByTestId('gov-agency-note')).toBeVisible()
  })
})
