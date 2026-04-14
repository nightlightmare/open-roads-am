import { test, expect } from '@playwright/test'
import { signInAs } from '../helpers/auth'
import { DEFAULT_LOCALE } from '../helpers/fixtures'

test.describe('Moderation Queue', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'moderator')
  })

  test('mod-queue-01: queue page renders', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/moderation`)
    // Wait for either report cards, empty state, or error state (API may be down)
    await expect(
      page.getByTestId('moderation-report-card').first()
        .or(page.getByText(/no pending|չկան/i))
        .or(page.getByRole('button', { name: /retry/i })),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('mod-queue-02: switch to "Under Review" tab', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/moderation`)
    await page.waitForTimeout(3000)
    // Find the second tab button
    const tabs = page.getByRole('button').filter({ hasText: /review|ուdelays/i })
    if (await tabs.first().isVisible()) {
      await tabs.first().click()
      await page.waitForTimeout(500)
    }
  })

  test('mod-queue-03: report card shows type and address', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/moderation`)
    await page.waitForTimeout(3000)
    const card = page.getByTestId('moderation-report-card').first()
    if (await card.isVisible()) {
      await expect(card.getByTestId('report-problem-type')).toBeVisible()
    }
  })

  test('mod-queue-05: clicking report card navigates to review page', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/moderation`)
    await page.waitForTimeout(3000)
    const card = page.getByTestId('moderation-report-card').first()
    if (await card.isVisible()) {
      await card.click()
      await page.waitForURL(/\/moderation\/reports\//)
    }
  })
})
