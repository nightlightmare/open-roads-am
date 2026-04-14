import { test, expect } from '@playwright/test'
import { signInAs } from '../helpers/auth'
import { DEFAULT_LOCALE } from '../helpers/fixtures'

test.describe('Confirmations', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'user')
  })

  test('confirmations-01: confirmations list renders', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/profile/confirmations`)
    await expect(
      page.getByTestId('confirmation-item').first().or(page.getByText(/no confirmation|չկան/i)),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('confirmations-02: confirmation item links to report', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/profile/confirmations`)
    await page.waitForTimeout(3000)
    const item = page.getByTestId('confirmation-item').first()
    if (await item.isVisible()) {
      await item.click()
      await page.waitForURL(/\/reports\//)
    }
  })
})
