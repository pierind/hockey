import { expect, test } from 'vitest'
import { validateDb } from './model'

// Drill files fetched by scripts/import-*.mjs into the gitignored private/ folder must pass the backup import checks.
const files = Object.entries(import.meta.glob<string>('../private/*.json', { query: '?raw', import: 'default', eager: true }))
test.skipIf(!files.length).each(files)('%s is importable', (_, raw) => {
  expect(validateDb(JSON.parse(raw)).drills.length).toBeGreaterThan(0)
})
