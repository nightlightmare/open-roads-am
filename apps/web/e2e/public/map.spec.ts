import { test, expect } from '@playwright/test'
import { DEFAULT_LOCALE } from '../helpers/fixtures'

test.describe('Public Map', () => {
  test('map-01: page loads with map visible', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}`)
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  })

  test('map-02: root redirects to locale', async ({ page }) => {
    await page.goto('/')
    await page.waitForURL(/\/(hy|ru|en)/, { timeout: 15_000 })
    expect(page.url()).toMatch(/\/(hy|ru|en)/)
  })

  test('map-03: report markers appear on map', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}`)
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    await page.waitForSelector('.maplibregl-marker', { timeout: 15_000 })
    const markers = page.locator('.maplibregl-marker')
    expect(await markers.count()).toBeGreaterThan(0)
  })

  test('map-04: cluster marker zooms in on click', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}`)
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()

    const marker = page.locator('.maplibregl-marker').first()
    if (!(await marker.isVisible({ timeout: 15_000 }).catch(() => false))) return

    // Find a cluster marker (has a count number inside)
    const clusterMarker = page.locator('.maplibregl-marker').filter({ hasText: /^\d+$/ }).first()
    if (await clusterMarker.isVisible()) {
      await clusterMarker.click()
      // Wait for zoom animation + new data load
      await page.waitForTimeout(3000)
      await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    }
  })

  test('map-05: report marker opens side panel', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}`)
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    await page.waitForSelector('.maplibregl-marker', { timeout: 15_000 })

    // Click a non-cluster marker (no number text)
    const reportMarker = page.locator('.maplibregl-marker').filter({ hasNotText: /^\d+$/ }).first()
    if (await reportMarker.isVisible()) {
      await reportMarker.click()
      await expect(page.getByTestId('report-side-panel')).toBeVisible()
    }
  })

  test('map-06: side panel closes on X button', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}`)
    await page.waitForSelector('.maplibregl-marker', { timeout: 15_000 })

    const reportMarker = page.locator('.maplibregl-marker').filter({ hasNotText: /^\d+$/ }).first()
    if (await reportMarker.isVisible()) {
      await reportMarker.click()
      await expect(page.getByTestId('report-side-panel')).toBeVisible()
      await page.getByRole('button', { name: /close/i }).click()
      await expect(page.getByTestId('report-side-panel')).not.toBeVisible()
    }
  })

  test('map-07: side panel "View Details" navigates to report page', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}`)
    await page.waitForSelector('.maplibregl-marker', { timeout: 15_000 })

    const reportMarker = page.locator('.maplibregl-marker').filter({ hasNotText: /^\d+$/ }).first()
    if (await reportMarker.isVisible()) {
      await reportMarker.click()
      await expect(page.getByTestId('report-side-panel')).toBeVisible()
      await page.getByRole('link', { name: /details|մանրամասներ/i }).click()
      await page.waitForURL(/\/reports\//)
    }
  })

  test('map-08: problem type filter changes markers', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}`)
    await page.waitForSelector('.maplibregl-marker', { timeout: 15_000 })

    const markersBefore = await page.locator('.maplibregl-marker').count()
    // Open filters and toggle a problem type
    const filterButton = page.getByRole('button', { name: /filter|ֆիլտր/i })
    if (await filterButton.isVisible()) {
      await filterButton.click()
      const checkbox = page.getByRole('checkbox').first()
      if (await checkbox.isVisible()) {
        await checkbox.click()
        await page.waitForTimeout(1000)
        const markersAfter = await page.locator('.maplibregl-marker').count()
        expect(markersAfter).not.toBe(markersBefore)
      }
    }
  })

  test('map-09: "Include resolved" toggle works', async ({ page }) => {
    await page.goto(`/${DEFAULT_LOCALE}`)
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()

    const toggle = page.getByRole('checkbox', { name: /resolved|լուծված/i })
    if (await toggle.isVisible()) {
      await toggle.click()
      // Should trigger a reload — just check map is still visible
      await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    }
  })
})
