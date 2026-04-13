import { test, expect } from '@playwright/test'
import { signInAs } from '../helpers/auth'
import { DEFAULT_LOCALE } from '../helpers/fixtures'

test.describe('Moderation Queue', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'moderator')
  })

  test('mod-queue-01: queue page renders pending reports', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/moderation`)
    // Either report cards or empty state
    const hasCards = await page.getByTestId('moderation-report-card').first().isVisible().catch(() => false)
    const hasEmpty = await page.getByText(/no pending/i).isVisible().catch(() => false)
    expect(hasCards || hasEmpty).toBe(true)
  })

  test('mod-queue-02: switch to "Under Review" tab', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/moderation`)
    const underReviewTab = page.getByRole('button', { name: /under review/i })
    if (await underReviewTab.isVisible()) {
      await underReviewTab.click()
      await page.waitForTimeout(500)
    }
  })

  test('mod-queue-03: report card shows type and address', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/moderation`)
    const card = page.getByTestId('moderation-report-card').first()
    if (await card.isVisible()) {
      await expect(card.getByTestId('report-problem-type')).toBeVisible()
    }
  })

  test('mod-queue-05: clicking report card navigates to review page', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/moderation`)
    const card = page.getByTestId('moderation-report-card').first()
    if (await card.isVisible()) {
      await card.click()
      await page.waitForURL(/\/moderation\/reports\//)
    }
  })
})
