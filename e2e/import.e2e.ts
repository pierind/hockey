import { expect, test } from '@playwright/test'

const drill = (id: string) => ({ id, title: `Übung ${id}`, description: '', keyPoints: [], categories: [], elements: [], offIce: false, draft: true, scene: { rink: 'full', items: [] }, updatedAt: '' })
const file = (name: string, ids: string[]) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 1, drills: ids.map(drill), collections: [], sessions: [] })) })

test('several backup files import together; an id in two files is rejected', async ({ page }) => {
  await page.goto('/')
  const input = page.locator('input[type=file]')
  await input.setInputFiles([file('a.json', ['a1', 'a2']), file('b.json', ['b1'])])
  await expect(page.getByText('Der Import enthält 3 Übungen')).toBeVisible()
  await page.getByRole('button', { name: 'Hinzufügen', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Übung b1' })).toBeVisible()

  await input.setInputFiles([file('a.json', ['a1']), file('a-kopie.json', ['a1'])])
  await expect(page.getByText(/Import abgelehnt, nichts geändert: Doppelte Übungs-IDs/)).toBeVisible()
})
