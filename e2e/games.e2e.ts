import { expect, test } from '@playwright/test'

// Create a game, fill the line-up, move a player, copy the line-up to a second game, keep it after reload.
test('game line-up', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')
  await page.getByRole('button', { name: 'Spiele', exact: true }).click()
  await page.getByRole('button', { name: 'Neues Spiel' }).click()
  await page.getByLabel('Gegner').fill('EHC Chur')
  await page.getByLabel('Gegner').blur()
  await page.getByLabel('Ort').selectOption('away')
  await page.getByLabel('Datum').fill('2026-10-18')
  await page.getByLabel('1. Sturm C').selectOption({ label: '9 Spieler/in 9' })
  await page.getByLabel('Tor Starter').selectOption({ label: '1 Spieler/in 1' })
  await page.getByLabel('2. Sturm C').selectOption({ label: '9 Spieler/in 9 (eingeteilt)' }) // moves the player
  await expect(page.getByLabel('1. Sturm C')).toHaveValue('')
  await expect(page.locator('.needs')).not.toContainText('Spieler/in 9,')

  await page.reload()
  await page.getByRole('button', { name: 'Spiele', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Auswärts bei EHC Chur' })).toBeVisible()
  await expect(page.locator('.list')).toContainText('2026-10-18 · 2 eingeteilt')

  await page.getByRole('button', { name: 'Neues Spiel' }).click()
  await page.getByLabel('Aufstellung von einem anderen Spiel übernehmen').selectOption({ label: '2026-10-18 · Auswärts bei EHC Chur' })
  await expect(page.getByLabel('2. Sturm C')).toHaveValue(/.+/)
  await expect(page.getByLabel('Tor Starter')).toHaveValue(/.+/)
})
