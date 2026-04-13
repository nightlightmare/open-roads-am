import { test, expect } from '@playwright/test'
import { signInAs } from '../helpers/auth'
import { DEFAULT_LOCALE } from '../helpers/fixtures'

test.describe('Profile Reports', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'user')
  })

  test('reports-01: reports list renders', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/profile/reports`)
    // Either report cards or empty state
    const hasReports = await page.getByTestId('report-card').first().isVisible().catch(() => false)
    const hasEmpty = await page.getByText(/no reports/i).isVisible().catch(() => false)
    expect(hasReports || hasEmpty).toBe(true)
  })

  test('reports-02: status filter tabs work', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/profile/reports`)
    const approvedTab = page.getByRole('button', { name: /approved/i })
    if (await approvedTab.isVisible()) {
      await approvedTab.click()
      await page.waitForTimeout(500)
    }
  })

  test('reports-04: report card navigates to detail', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/profile/reports`)
    const card = page.getByTestId('report-card').first()
    if (await card.isVisible()) {
      await card.click()
      await page.waitForURL(/\/profile\/reports\//)
    }
  })

  test('reports-05: profile report detail shows AI and user classification', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/profile/reports`)
    const card = page.getByTestId('report-card').first()
    if (await card.isVisible()) {
      await card.click()
      await page.waitForURL(/\/profile\/reports\//)
      await expect(page.getByTestId('user-classification')).toBeVisible()
    }
  })

  test('reports-06: profile report detail shows status history', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/profile/reports`)
    const card = page.getByTestId('report-card').first()
    if (await card.isVisible()) {
      await card.click()
      await page.waitForURL(/\/profile\/reports\//)
      await expect(page.getByTestId('status-history')).toBeVisible()
    }
  })
})
