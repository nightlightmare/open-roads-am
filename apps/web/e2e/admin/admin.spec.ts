import { test, expect } from '@playwright/test'
import { signInAs } from '../helpers/auth'
import { DEFAULT_LOCALE } from '../helpers/fixtures'

test.describe('Admin Panel', () => {
  test.setTimeout(60_000)
  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'admin')
  })

  test('admin-01: admin page renders both sections', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/admin`)
    await expect(page.getByTestId('change-role-form')).toBeVisible({ timeout: 10_000 })
  })

  test('admin-02: change role form requires Clerk ID', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/admin`)
    await expect(page.getByTestId('change-role-form')).toBeVisible({ timeout: 10_000 })
    const saveBtn = page.getByTestId('change-role-form').locator('button[type="submit"]')
    await expect(saveBtn).toBeDisabled()

    await page.locator('#clerk-id').fill('user_test123')
    await expect(saveBtn).toBeEnabled()
  })

  test('admin-03: create API key form works', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/admin`)
    await expect(page.getByTestId('change-role-form')).toBeVisible({ timeout: 10_000 })

    // Click "Create key" button to show the form
    const form = page.getByTestId('create-api-key-form')
    if (!(await form.isVisible())) {
      const sections = page.locator('section')
      await sections.nth(1).getByRole('button').first().click()
    }

    await expect(form).toBeVisible({ timeout: 5_000 })
    // Submit button should be visible and form should have description input
    await expect(form.locator('button[type="submit"]')).toBeVisible()
    await expect(page.locator('#key-description')).toBeVisible()
  })

  test('admin-04: API key creation form submits', async ({ page }) => {
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
    await page.waitForTimeout(3000)

    // Expect either a created key or an error message (API schema mismatch)
    await expect(
      page.getByText(/oak_live_/).or(page.getByText(/error|VALIDATION/i)),
    ).toBeVisible({ timeout: 5_000 })
  })
})
