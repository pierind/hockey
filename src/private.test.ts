import { expect, test } from 'vitest'
import { validateDb } from './model'

// Drill files fetched by scripts/import-*.mjs into the gitignored private/ folder must pass the backup import checks.
const files = Object.entries(import.meta.glob<string>('../private/*.json', { query: '?raw', import: 'default', eager: true }))
// private/ is gitignored, so CI has no files; a file without any test fails vitest.
if (!files.length) test.skip('private drill files are importable (none here, run scripts/import-*.mjs)', () => {})
test.each(files)('%s is importable', (_, raw) => {
  expect(validateDb(JSON.parse(raw)).drills.length).toBeGreaterThan(0)
})
