import { test, expect } from '@playwright/test'
import { signInAs } from '../helpers/auth'
import { DEFAULT_LOCALE } from '../helpers/fixtures'

test.describe('Confirmations', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'user')
  })

  test('confirmations-01: confirmations list renders', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/profile/confirmations`)
    const hasList = await page.getByTestId('confirmation-item').first().isVisible().catch(() => false)
    const hasEmpty = await page.getByText(/no confirmation/i).isVisible().catch(() => false)
    expect(hasList || hasEmpty).toBe(true)
  })

  test('confirmations-02: confirmation item links to report', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/profile/confirmations`)
    const item = page.getByTestId('confirmation-item').first()
    if (await item.isVisible()) {
      await item.click()
      await page.waitForURL(/\/reports\//)
    }
  })
})
