import { test, expect } from '@playwright/test'
import { signInAs } from '../helpers/auth'
import { DEFAULT_LOCALE } from '../helpers/fixtures'

test.describe('Admin Panel', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'admin')
  })

  test('admin-01: admin page renders both sections', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/admin`)
    await expect(page.getByTestId('change-role-form')).toBeVisible()
    await expect(page.getByTestId('create-api-key-form')).toBeVisible()
  })

  test('admin-02: change role form requires Clerk ID', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/admin`)
    const saveBtn = page.getByTestId('change-role-form').getByRole('button', { name: /save|change/i })
    await expect(saveBtn).toBeDisabled()

    await page.getByPlaceholder(/clerk id/i).fill('user_test123')
    await expect(saveBtn).toBeEnabled()
  })

  test('admin-03: create API key requires description', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/admin`)
    const createBtn = page.getByTestId('create-api-key-form').getByRole('button', { name: /create/i })
    await expect(createBtn).toBeDisabled()

    await page.getByPlaceholder(/description/i).fill('Test key')
    await expect(createBtn).toBeEnabled()
  })

  test('admin-04: successful API key creation shows key', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/admin`)
    await page.getByPlaceholder(/description/i).fill('E2E test key')
    await page.getByTestId('create-api-key-form').getByRole('button', { name: /create/i }).click()

    await expect(page.getByText(/oak_live_/)).toBeVisible({ timeout: 10_000 })
  })
})
