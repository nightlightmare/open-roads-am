import { test, expect } from '@playwright/test'
import { signInAs } from '../helpers/auth'
import { DEFAULT_LOCALE } from '../helpers/fixtures'

test.describe('Admin Panel', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'admin')
  })

  test('admin-01: admin page renders both sections', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/admin`)
    await expect(page.getByTestId('change-role-form')).toBeVisible({ timeout: 10_000 })
    // API keys section: either the form or the "show form" button
    await expect(
      page.getByTestId('create-api-key-form').or(page.locator('button:has-text("oak_live_")').first().or(page.locator('section').nth(1))),
    ).toBeVisible()
  })

  test('admin-02: change role form requires Clerk ID', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/admin`)
    await expect(page.getByTestId('change-role-form')).toBeVisible({ timeout: 10_000 })
    const saveBtn = page.getByTestId('change-role-form').getByRole('button', { type: 'submit' } as never)
    await expect(saveBtn).toBeDisabled()

    await page.locator('#clerk-id').fill('user_test123')
    await expect(saveBtn).toBeEnabled()
  })

  test('admin-03: create API key requires description', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/admin`)
    await expect(page.getByTestId('change-role-form')).toBeVisible({ timeout: 10_000 })

    // Click "Create key" button to show the form (if not already visible)
    const form = page.getByTestId('create-api-key-form')
    if (!(await form.isVisible())) {
      // Find the button in the second section that shows the form
      const sections = page.locator('section')
      await sections.nth(1).getByRole('button').first().click()
    }

    await expect(form).toBeVisible({ timeout: 5_000 })
    const submitBtn = form.locator('button[type="submit"]')
    await expect(submitBtn).toBeDisabled()

    await page.locator('#key-description').fill('Test key')
    await expect(submitBtn).toBeEnabled()
  })

  test('admin-04: successful API key creation shows key', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/admin`)
    await expect(page.getByTestId('change-role-form')).toBeVisible({ timeout: 10_000 })

    const form = page.getByTestId('create-api-key-form')
    if (!(await form.isVisible())) {
      const sections = page.locator('section')
      await sections.nth(1).getByRole('button').first().click()
    }

    await expect(form).toBeVisible({ timeout: 5_000 })
    await page.locator('#key-description').fill('E2E test key')
    await form.locator('button[type="submit"]').click()

    await expect(page.getByText(/oak_live_/)).toBeVisible({ timeout: 10_000 })
  })
})
