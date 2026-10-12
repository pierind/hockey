import { expect, test } from 'vitest'
import { addEntries, categoryCollections, categoryMinutes, deleteDrill, fromTemplate, mergeDb, saveVariant, selectSessions, filterDrills, filterSessions, isoWeek, periodStats, drillProblems, duplicateDrill, migrateDrill, moveIndex, newDrill, upsertDrill, validateDb } from './model'
import type { Db, Drill } from './types'

const drill = (over: Partial<Drill> = {}): Drill => ({
  ...newDrill(),
  title: 'Give and Go',
  description: 'Zu zweit',
  keyPoints: ['Sofort anbieten'],
  categories: ['EF06', 'EF08'],
  primary: 'EF08',
  elements: ['U02'],
  minutes: 12,
  draft: false,
  updatedAt: '2026-10-11T00:00:00.000Z',
  scene: {
    rink: 'half',
    items: [
      { id: 'a', kind: 'offense', at: [40, 10], label: '7' },
      { id: 'g', kind: 'goal', at: [56, 15], rot: 180 },
      { id: 'r', kind: 'route', style: 'pass', from: [40, 10], to: [45, 20], ctrl: [44, 12] },
      { id: 'h', kind: 'route', style: 'backwardPuck', from: [30, 10], to: [35, 20], via: [[31, 14], [33, 15]] },
      { id: 'b', kind: 'toblerone', at: [37.5, 15], rot: 90 },
      { id: 'f', kind: 'free', pts: [[1, 1], [2, 2]] },
      { id: 't', kind: 'text', at: [50, 5], text: '<b>kein HTML</b>' },
    ],
  },
  ...over,
})

function sample(): Db {
  const d = drill()
  return {
    version: 1,
    drills: [d],
    collections: [{ id: 'c', name: 'Passen', drillIds: [d.id] }],
    sessions: [addEntries({ id: 's', title: 'Dienstag', date: '2026-10-13', notes: 'Fokus: Passen', entries: [] }, [d, d])],
  }
}
const roundTrip = (db: unknown) => validateDb(JSON.parse(JSON.stringify(db)))

test('backup export/import round trip keeps scenes and relationships', () => {
  const db = sample()
  expect(roundTrip(db)).toEqual(db)
})

test('invalid backups are rejected', () => {
  const db = sample()
  const bad: unknown[] = [
    { ...db, version: 2 },
    { ...db, collections: [{ id: 'c', name: 'X', drillIds: ['missing'] }] },
    { ...db, drills: [drill({ id: db.drills[0].id, categories: ['EF99'] })] },
    { ...db, drills: [drill({ id: db.drills[0].id, minutes: -1 })] },
    { ...db, drills: [drill({ id: db.drills[0].id, scene: { rink: 'full', items: [{ id: 'x', kind: 'puck', at: [NaN, 1] }] } })] },
    { ...db, drills: [{ ...db.drills[0], scene: { rink: 'full', items: [{ id: 'x', kind: 'svg', at: [1, 1] }] } }] },
    { ...db, sessions: [{ ...db.sessions[0], entries: [{ ...db.sessions[0].entries[0], minutes: -5 }] }] },
    { ...db, drills: [db.drills[0], db.drills[0]] },
    'not json object',
  ]
  for (const b of bad) expect(() => roundTrip(b)).toThrow()
})

test('session entries are snapshots and may repeat a drill', () => {
  const db = sample()
  const [e1, e2] = db.sessions[0].entries
  expect(e1.id).not.toBe(e2.id)
  const edited = deleteDrill(upsertDrill(db, { ...db.drills[0], title: 'Neu' }), db.drills[0].id)
  expect(edited.sessions[0].entries[0].drill.title).toBe('Give and Go')
  expect(edited.collections[0].drillIds).toEqual([])
})

test('duplicating then editing does not touch the original', () => {
  const d = drill()
  const copy = duplicateDrill(d)
  ;(copy.scene.items[0] as { at: number[] }).at[0] = 0
  expect(copy.id).not.toBe(d.id)
  expect(d.scene.items[0]).toMatchObject({ at: [40, 10] })
})

test('drillProblems lists missing required fields', () => {
  expect(drillProblems(drill())).toEqual([])
  expect(drillProblems(newDrill())).toHaveLength(4)
})

test('moveIndex reorders', () => {
  expect(moveIndex(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
  expect(moveIndex(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b'])
})

test('old Spielfeldbegrenzung lines open as Toblerones along the same line', () => {
  const old = drill({ scene: { rink: 'full', items: [{ id: 'b', kind: 'boundary', from: [10, 5], to: [10, 25] } as never] } })
  expect(migrateDrill(old).scene.items).toEqual([{ id: 'b', kind: 'toblerone', at: [10, 15], rot: 90 }])
})

test('category collections follow the drills\' Erscheinungsformen', () => {
  const db = sample()
  const auto = categoryCollections(db)
  expect(auto).toHaveLength(9)
  expect(auto.find((c) => c.id === 'EF06')?.drillIds).toEqual([db.drills[0].id])
  expect(auto.find((c) => c.id === 'EF01')?.drillIds).toEqual([])
})

test('isoWeek follows ISO 8601 across year boundaries', () => {
  expect(isoWeek('2025-12-05')).toBe('2025-W49')
  expect(isoWeek('2026-01-01')).toBe('2026-W01')
  expect(isoWeek('2024-12-30')).toBe('2025-W01')
  expect(isoWeek('2021-01-03')).toBe('2020-W53')
})

test('search finds drills and trainings by Erscheinungsform and Schlüsselelement', () => {
  const db = sample()
  expect(filterDrills(db.drills, '', 'EF08', 'U02', '')).toHaveLength(1)
  expect(filterDrills(db.drills, '', '', 'D01', '')).toHaveLength(0)
  expect(filterSessions(db.sessions, '', 'EF08', '')).toHaveLength(1)
  expect(filterSessions(db.sessions, '', '', 'B01')).toHaveLength(0)
  expect(filterSessions(db.sessions, 'sofort anbieten', '', '')).toHaveLength(1)
})

test('periodStats splits definitive and planned trainings per period and skips undated ones', () => {
  const [s] = sample().sessions
  const rows = periodStats([s, { ...s, id: 'f', final: true }, { ...s, id: 'u', date: undefined }], isoWeek)
  expect(rows).toEqual([{ period: '2026-W42', final: { count: 1, minutes: 24 }, planned: { count: 1, minutes: 24 } }])
})

test('selectSessions filters by status and inclusive date range, dropping undated trainings', () => {
  const [s] = sample().sessions
  const all = [s, { ...s, id: 'f', final: true, date: '2026-11-02' }, { ...s, id: 'u', date: undefined }]
  expect(selectSessions(all, '', '', '').map((x) => x.id)).toEqual([s.id, 'f'])
  expect(selectSessions(all, 'final', '', '').map((x) => x.id)).toEqual(['f'])
  expect(selectSessions(all, 'planned', '', '').map((x) => x.id)).toEqual([s.id])
  expect(selectSessions(all, '', '2026-10-13', '2026-10-13').map((x) => x.id)).toEqual([s.id])
})

test('categoryMinutes splits a drill\'s minutes across its Erscheinungsformen', () => {
  const { periods, rows } = categoryMinutes(sample().sessions, () => 'total')
  expect(periods).toEqual(['total'])
  expect(rows).toHaveLength(9)
  expect(rows.find((r) => r.category === 'EF06')?.total).toBe(12) // 2 entries × 12 min, half each to EF06 and EF08
  expect(rows.reduce((sum, r) => sum + r.total, 0)).toBe(24)
})

test('mergeDb adds new records, skips identical ones and copies conflicting ones without overwriting', () => {
  const mine = sample()
  const theirs = structuredClone(mine)
  theirs.drills[0].title = 'Geändert'
  theirs.drills.push({ ...theirs.drills[0], id: 'new', title: 'Neu' })
  theirs.collections[0].drillIds.push('new')
  const { db, added, skipped } = mergeDb(mine, theirs)
  expect(skipped).toBe(1) // the unchanged session
  expect(added).toEqual({ drills: 2, collections: 1, sessions: 0 })
  expect(db.drills.map((d) => d.title)).toEqual(['Give and Go', 'Geändert (Import)', 'Neu'])
  expect(db.collections[0]).toEqual(mine.collections[0])
  expect(db.collections[1].drillIds).toEqual([db.drills[1].id, 'new']) // points at the copy, not the original
  expect(() => validateDb(JSON.parse(JSON.stringify(db)))).not.toThrow()
  expect(mergeDb(mine, mine).skipped).toBe(3)
})

test('templates are reusable and stay out of the reports', () => {
  const [s] = sample().sessions
  const tpl = { ...s, id: 't', template: true, final: true }
  const fresh = fromTemplate(tpl)
  expect(fresh).toMatchObject({ title: s.title, date: undefined, template: undefined, final: undefined, notes: s.notes })
  expect(fresh.id).not.toBe('t')
  expect(fresh.entries.map((e) => e.id)).not.toEqual(s.entries.map((e) => e.id))
  expect(selectSessions([s, tpl], '', '', '').map((x) => x.id)).toEqual([s.id])
})

test('saveVariant adds a new drill and changes only the edited entry', () => {
  const db = sample()
  const [first, second] = db.sessions[0].entries
  const variant = { ...structuredClone(first.drill), id: 'v', title: 'Give and Go (Variante)', minutes: 15 }
  const next = saveVariant(db, 's', first.id, variant)
  expect(next.drills.map((d) => d.id)).toEqual([db.drills[0].id, 'v'])
  expect(next.drills[0]).toEqual(db.drills[0])
  expect(next.sessions[0].entries[0].drill.id).toBe('v')
  expect(next.sessions[0].entries[1]).toEqual(second)
})
