import { expect, test } from '@playwright/test'

// Rebuild the SIHF plan, date the ice season, plan from a week and see the training in its Ist.
test('season plan and team', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')
  await page.getByRole('button', { name: 'Team' }).click()
  await expect(page.locator('table.team tbody tr')).toHaveCount(20)
  await page.getByLabel('Name Spieler/in 1', { exact: true }).fill('Lia Muster')
  await page.getByLabel('Name Spieler/in 1', { exact: true }).blur()
  await expect(page.getByLabel('Name Lia Muster')).toHaveValue('Lia Muster')

  await page.getByRole('button', { name: 'Saisonplan' }).click()
  await page.getByRole('button', { name: 'SIHF-Beispiel übernehmen' }).click()
  await expect(page.locator('details.week')).toHaveCount(39)
  await expect(page.locator('.pause')).toHaveText(['Sommerpause', 'Weihnachtspause'])
  const camp = page.locator('details.week').filter({ hasText: 'Trainingslager' })
  await expect(camp).toContainText('8 Trainings geplant')

  const w1 = page.locator('details.week').nth(10) // Eissaison W1
  await w1.locator('summary').click()
  await w1.getByLabel('Wochenbeginn').fill('2026-08-10')
  await w1.getByRole('button', { name: 'Folgende Wochen datieren' }).click()
  await expect(page.locator('details.week').nth(11).locator('summary')).toContainText('ab 17.8.26')
  await w1.getByRole('button', { name: 'Training anlegen' }).first().click()
  await expect(w1.locator('summary')).toContainText('Ist: 1 Trainings, 0/2 Ziele')
  await expect(w1.locator('.week-body .list')).toContainText('Eissaison W1 · Training 1')
})
