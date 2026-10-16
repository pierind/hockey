import { expect, test } from 'vitest'
import example from '../docs/examples/u12-training-2025-12-05.json?raw'
import { totalMinutes, validateDb } from './model'

test('example backup is importable', () => {
  const db = validateDb(JSON.parse(example))
  expect(db.sessions.map((s) => [s.title, totalMinutes(s)])).toEqual([['U12 On-Ice', 7 + 2 + 40 + 2 + 20], ['U12 Off-Ice', 5 + 2 + 36 + 2 + 5]])
})
