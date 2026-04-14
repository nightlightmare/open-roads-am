import { test, expect } from '@playwright/test'
import { signInAs } from '../helpers/auth'
import { DEFAULT_LOCALE } from '../helpers/fixtures'
import path from 'node:path'

test.describe('Report Submission', () => {
  test.setTimeout(120_000)

  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'user')
  })

  test('submit-01: submit page renders step 1', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/submit`)
    await expect(page.getByTestId('photo-dropzone')).toBeVisible()
    await expect(page.getByRole('button', { name: /→$/ })).toBeDisabled()
  })

  test('submit-02: photo upload triggers AI classification', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/submit`)

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(path.join(__dirname, '../helpers/test-photo.jpg'))

    // Should show analyzing state
    await expect(page.getByText(/Analyz|Վերլուծվում|Анализируем/i)).toBeVisible({ timeout: 10_000 })

    // Should eventually show category grid
    await expect(page.getByTestId('category-grid')).toBeVisible({ timeout: 90_000 })
  })

  test('submit-03: user can change category selection', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/submit`)

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(path.join(__dirname, '../helpers/test-photo.jpg'))
    await expect(page.getByTestId('category-grid')).toBeVisible({ timeout: 90_000 })

    const buttons = page.getByTestId('category-grid').getByRole('button')
    const secondButton = buttons.nth(1)
    await secondButton.click()
    await expect(secondButton).toHaveAttribute('data-selected', 'true')
  })

  test('submit-04: next button enabled after category selected', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/submit`)

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(path.join(__dirname, '../helpers/test-photo.jpg'))
    await expect(page.getByTestId('category-grid')).toBeVisible({ timeout: 90_000 })

    // Select a category
    await page.getByTestId('category-grid').getByRole('button').first().click()
    await expect(page.getByRole('button', { name: /→$/ })).toBeEnabled()

    // Go to step 2
    await page.getByRole('button', { name: /→$/ }).click()
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  })

  test('submit-05: step 2 shows location map', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/submit`)

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(path.join(__dirname, '../helpers/test-photo.jpg'))
    await expect(page.getByTestId('category-grid')).toBeVisible({ timeout: 90_000 })
    await page.getByTestId('category-grid').getByRole('button').first().click()
    await page.getByRole('button', { name: /→$/ }).click()

    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    await expect(page.locator('.maplibregl-marker')).toBeVisible()
  })

  test('submit-06: description character counter', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/submit`)

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(path.join(__dirname, '../helpers/test-photo.jpg'))
    await expect(page.getByTestId('category-grid')).toBeVisible({ timeout: 90_000 })
    await page.getByTestId('category-grid').getByRole('button').first().click()
    await page.getByRole('button', { name: /→$/ }).click()

    const textarea = page.getByRole('textbox')
    await textarea.fill('A'.repeat(100))
    await expect(page.getByText('100/1000')).toBeVisible()
  })

  test('submit-07: back button returns to step 1', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/submit`)

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(path.join(__dirname, '../helpers/test-photo.jpg'))
    await expect(page.getByTestId('category-grid')).toBeVisible({ timeout: 90_000 })
    await page.getByTestId('category-grid').getByRole('button').first().click()
    await page.getByRole('button', { name: /→$/ }).click()

    await page.getByRole('button', { name: /^←/ }).click()
    await expect(page.getByTestId('photo-dropzone')).toBeVisible()
  })

  test('submit-09: cannot submit without photo', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}/submit`)
    await expect(page.getByRole('button', { name: /→$/ })).toBeDisabled()
  })
})
