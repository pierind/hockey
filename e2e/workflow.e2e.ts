import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

// design -> save -> reload -> collect -> training (start time, Posten-Block) -> print view -> export -> import (add)
test('coach workflow', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')

  // Draw a drill
  await page.getByRole('button', { name: 'Neue Übung' }).click()
  const rink = page.getByRole('application')
  const box = (await rink.boundingBox())!
  const at = (fx: number, fy: number) => [box.x + box.width * fx, box.y + box.height * fy] as const

  await page.getByRole('button', { name: 'Offensivspieler/in', exact: true }).click()
  await rink.click({ position: { x: box.width * 0.3, y: box.height * 0.4 } })
  await page.getByRole('button', { name: 'Pass', exact: true }).click()
  await page.mouse.move(...at(0.32, 0.42))
  await page.mouse.down()
  await page.mouse.move(...at(0.5, 0.7), { steps: 8 })
  await page.mouse.up()
  // Hand-drawn skating line, nearly straight: one undo restores the freehand version, a second removes it.
  await page.getByRole('button', { name: 'Schlittschuhlaufen vorwärts ohne Puck' }).click()
  await page.mouse.move(...at(0.2, 0.2))
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(...at(0.2 + i * 0.04, 0.2 + (i % 2 ? 0.004 : 0)))
  await page.mouse.up()
  const routes = rink.locator('polygon') // one arrowhead per route
  await expect(routes).toHaveCount(2)
  await page.getByRole('button', { name: 'Rückgängig' }).click()
  await expect(routes).toHaveCount(2)
  await page.getByRole('button', { name: 'Rückgängig' }).click()
  await expect(routes).toHaveCount(1)
  await page.getByRole('button', { name: 'Wiederholen' }).click()

  // Form after drawing: filling it scrolls the page, which would invalidate the rink's measured position.
  await page.getByLabel('Titel', { exact: true }).fill('Give and Go Test')
  await page.getByLabel('Beschreibung (Aufbau und Ablauf)').fill('Zu zweit über die ganze Fläche')
  await page.getByLabel('Coaching-Punkt 1').fill('Sofort wieder anbieten')
  await page.getByLabel('Überzahlsituationen kreieren und erfolgreich nutzen').check()
  await page.getByLabel('Dauer-Vorschlag (Min.)').fill('12')
  await page.getByLabel('Spieler/innen').fill('4')
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByRole('status').filter({ hasText: /^Gespeichert$/ })).toBeVisible()
  await page.getByRole('button', { name: '← Zurück' }).click()

  // Survives a reload
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Give and Go Test' })).toBeVisible()

  // Collection
  await page.getByRole('button', { name: 'Sammlungen' }).click()
  await page.getByLabel('Name der neuen Sammlung').fill('Passen')
  await page.getByRole('button', { name: 'Sammlung erstellen' }).click()
  await page.getByLabel('Übung zu Passen hinzufügen').fill('give and go')
  await page.locator('.picker-list button', { hasText: 'Give and Go Test' }).click()
  await expect(page.getByRole('button', { name: 'Give and Go Test' })).toBeVisible()

  // Training with start time; the same drill twice, first in a row (2 min changeover), then as a Posten-Block
  await page.getByRole('button', { name: 'Trainings' }).click()
  await page.getByRole('button', { name: 'Neues Training' }).click()
  await page.getByLabel('Start').fill('17:00')
  await page.getByLabel('Übung aus der Bibliothek hinzufügen').fill('Give and Go')
  await page.locator('.picker-list button', { hasText: 'Give and Go Test' }).click()
  await page.getByLabel('Übung aus der Bibliothek hinzufügen').fill('Give and Go')
  await page.getByLabel('Übung aus der Bibliothek hinzufügen').press('Enter') // Enter picks the first match
  await expect(page.getByText('Total: 26 Min. · 17:00–17:26')).toBeVisible()
  await page.getByLabel('Parallel (Posten)').check()
  await expect(page.getByText('Total: 24 Min. · 17:00–17:24')).toBeVisible()
  // Attendance: record, mark one player absent
  await page.locator('summary', { hasText: 'Anwesenheit (AWK)' }).click()
  await page.getByRole('button', { name: 'Anwesenheit erfassen (alle anwesend)' }).click()
  await page.getByLabel('3 Spieler/in 3 (D)').uncheck()
  await expect(page.getByText('Anwesenheit (AWK): 19 von 20')).toBeVisible()
  await expect(page.getByText('Benötigt: 8 Spieler/innen')).toBeVisible()
  await page.getByRole('button', { name: 'Als definitiv markieren' }).click()

  // Print view shows the sheet with the block and the legend
  await page.emulateMedia({ media: 'print' })
  await expect(page.getByRole('heading', { name: 'Neues Training', level: 1 })).toBeVisible()
  await expect(page.getByText('1. Posten-Block · 2 Posten · 24 Min.')).toBeVisible()
  const sheet = page.locator('.print-only')
  await expect(sheet).toContainText('Blau: 1 Spieler/in 1 (G), 5 Spieler/in 5 (D)') // groups of present players…
  await expect(sheet).not.toContainText('Spieler/in 3 (D)') // …without the absent one
  await expect(sheet.getByRole('list', { name: 'Legende' })).toHaveCount(0) // no symbol legend on the sheet
  await page.emulateMedia({ media: 'screen' })

  // Export, then import the same file with «Hinzufügen»: everything is already there
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Backup exportieren' }).click()])
  const file = await download.path()
  const backup = JSON.parse(readFileSync(file, 'utf8'))
  expect([backup.drills.length, backup.collections.length, backup.sessions.length, backup.players.length]).toEqual([1, 1, 1, 20])
  await page.locator('input[type=file]').setInputFiles(file)
  await page.getByRole('button', { name: 'Hinzufügen' }).click()
  await expect(page.getByText('0 Übungen, 0 Sammlungen, 0 Trainings, 0 Spiele hinzugefügt; 23 bereits vorhanden.')).toBeVisible()
})
