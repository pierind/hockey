import { expect, test } from '@playwright/test'

test('teams: switch, a training per team and a joint training', async ({ page }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation')
  const active = page.getByLabel('Aktives Team')
  await expect(active).toHaveValue(/.+/)

  // Second team, created and renamed on the Team page; it becomes the active team with an empty roster
  await nav.getByRole('button', { name: 'Team' }).click()
  await page.getByRole('button', { name: '+ Neues Team' }).click()
  await page.getByLabel('Teamname').fill('U11')
  await page.getByLabel('Teamname').blur()
  await expect(active.locator('option:checked')).toHaveText('U11')
  await expect(page.getByText('Noch keine Spieler/innen.')).toBeVisible()

  // A training planned in U11 shows only there
  await nav.getByRole('button', { name: 'Trainings' }).click()
  await page.getByRole('button', { name: 'Neues Training' }).click()
  await page.getByLabel('Titel').fill('U11 Training')
  await page.getByLabel('Titel').blur()
  await page.getByRole('button', { name: '← Alle Trainings' }).click()
  await expect(page.getByRole('button', { name: 'U11 Training' })).toBeVisible()
  await active.selectOption({ label: 'Mein Team' })
  await expect(page.getByRole('button', { name: 'U11 Training' })).toHaveCount(0)

  // Joint training: planned in «Mein Team», also ticked for U11; attendance lists the players of both teams
  await page.getByRole('button', { name: 'Neues Training' }).click()
  await page.getByLabel('Titel').fill('Gemeinsam')
  await page.getByLabel('Titel').blur()
  const pick = page.getByRole('group', { name: 'Teams des Trainings' })
  await expect(pick.getByRole('checkbox').first()).toBeDisabled() // the active team stays ticked
  await pick.getByRole('checkbox').nth(1).check()
  await page.locator('summary', { hasText: 'Anwesenheit (AWK)' }).click()
  await page.getByRole('button', { name: 'Anwesenheit erfassen (alle anwesend)' }).click()
  await expect(page.getByText('Anwesenheit (AWK): 20 von 20')).toBeVisible()
  await page.getByRole('button', { name: '← Alle Trainings' }).click()
  await active.selectOption({ label: 'U11' })
  await expect(page.getByRole('button', { name: 'Gemeinsam' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'U11 Training' })).toBeVisible()

  // The active team is remembered after a reload
  await page.reload()
  await expect(page.getByLabel('Aktives Team').locator('option:checked')).toHaveText('U11')
})
