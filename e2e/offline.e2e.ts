import { expect, test } from '@playwright/test'

test.use({ baseURL: 'http://localhost:5198' })

// After one online visit the built app opens without network, and is installable.
test('works offline after the first visit', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Eishockey Trainingsplaner' })).toBeVisible()
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload() // now controlled by the service worker, which caches what loads
  await expect(page.locator('link[rel=manifest]')).toHaveAttribute('href', 'manifest.webmanifest')
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Eishockey Trainingsplaner' })).toBeVisible()
  await page.getByRole('button', { name: 'Neue Übung' }).click()
  await expect(page.getByRole('application')).toBeVisible()
})
