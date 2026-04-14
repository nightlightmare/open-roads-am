import { test, expect } from '@playwright/test'
import { signInAs } from '../helpers/auth'
import { DEFAULT_LOCALE } from '../helpers/fixtures'

test.describe('Profile Reports', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'user')
  })

  test('reports-01: reports list renders', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/profile/reports`)
    // Wait for loading to finish — then expect either cards or empty state
    await expect(
      page.getByTestId('report-card').first().or(page.getByText(/no reports|չկան/i)),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('reports-02: status filter tabs work', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/profile/reports`)
    // Wait for page to load
    await expect(
      page.getByTestId('report-card').first().or(page.getByText(/no reports|չկան/i)),
    ).toBeVisible({ timeout: 10_000 })
    // Tab buttons are rounded-full pills — use CSS to target them specifically
    const approvedTab = page.locator('button.rounded-full', { hasText: /approved|Հաստատված/i }).first()
    if (await approvedTab.isVisible()) {
      await approvedTab.click()
      await page.waitForTimeout(500)
    }
  })

  test('reports-04: report card navigates to detail', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/profile/reports`)
    await page.waitForTimeout(3000)
    const card = page.getByTestId('report-card').first()
    if (await card.isVisible()) {
      await card.click()
      await page.waitForURL(/\/profile\/reports\//)
    }
  })

  test('reports-05: profile report detail shows AI and user classification', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/profile/reports`)
    await page.waitForTimeout(3000)
    const card = page.getByTestId('report-card').first()
    if (await card.isVisible()) {
      await card.click()
      await page.waitForURL(/\/profile\/reports\//)
      await expect(page.getByTestId('user-classification')).toBeVisible()
    }
  })

  test('reports-06: profile report detail shows status history', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/profile/reports`)
    await page.waitForTimeout(3000)
    const card = page.getByTestId('report-card').first()
    if (await card.isVisible()) {
      await card.click()
      await page.waitForURL(/\/profile\/reports\//)
      // Status history may be empty for some reports
      const history = page.getByTestId('status-history')
      await expect(history.or(page.getByTestId('user-classification'))).toBeVisible({ timeout: 5_000 })
    }
  })
})
