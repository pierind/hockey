import { expect, test } from '@playwright/test'

test('coaches board: draw, erase, undo, keep after reload', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')
  await page.getByRole('button', { name: 'Taktiktafel' }).click()
  const board = page.getByRole('application')
  const box = (await board.boundingBox())!
  const at = (fx: number, fy: number) => [box.x + box.width * fx, box.y + box.height * fy] as const
  const strokes = board.locator('polyline')
  const draw = async (y: number) => {
    await page.mouse.move(...at(0.2, y))
    await page.mouse.down()
    await page.mouse.move(...at(0.6, y + 0.1), { steps: 10 })
    await page.mouse.up()
  }

  // Vollbild: the rink fills the screen below one tool row and still takes drawings
  await page.getByRole('button', { name: 'Vollbild', exact: true }).click()
  const fullBox = (await board.boundingBox())!
  expect(fullBox.width).toBeGreaterThan(page.viewportSize()!.width - 40)
  await page.getByRole('button', { name: 'Vollbild beenden' }).click()
  await expect(page.getByRole('heading', { name: 'Taktiktafel' })).toBeVisible()

  await draw(0.3)
  await page.getByRole('button', { name: 'Stift Rot' }).click()
  await draw(0.6)
  await expect(strokes).toHaveCount(2)
  await expect(strokes.last()).toHaveAttribute('stroke', '#d03b3b')

  await page.getByRole('button', { name: 'Radierer' }).click()
  await page.mouse.move(...at(0.4, 0.1))
  await page.mouse.down()
  await page.mouse.move(...at(0.4, 0.5), { steps: 10 }) // crosses only the first stroke
  await page.mouse.up()
  await expect(strokes).toHaveCount(1)
  await page.getByRole('button', { name: 'Rückgängig' }).click()
  await expect(strokes).toHaveCount(2)

  await page.getByRole('button', { name: 'Alles löschen' }).click()
  await expect(strokes).toHaveCount(0)
  await page.getByRole('button', { name: 'Rückgängig' }).click()
  await expect(strokes).toHaveCount(2)

  // The board is written to IndexedDB right after each change; wait for that write, then reload.
  const storedStrokes = () => page.evaluate(() => new Promise<number>((res) => {
    const r = indexedDB.open('hockey-planner', 1)
    r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('board'); g.onsuccess = () => res(g.result?.strokes.length ?? -1) }
  }))
  await expect.poll(storedStrokes).toBe(2)
  await page.reload()
  await page.getByRole('button', { name: 'Taktiktafel' }).click()
  await expect(page.getByRole('application').locator('polyline')).toHaveCount(2)
})
