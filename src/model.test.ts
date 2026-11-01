import { expect, test } from 'vitest'
import { emptyDb, addDays, coveredElements, toIcs, setSlot, removePlayer, gameTitle, dummyTeam, fillDates, migrateDb, newPlan, sessionsInWeek, addEntries, blocks, clock, needs, timeline, totalMinutes, categoryCollections, categoryMinutes, deleteDrill, fromTemplate, mergeDb, saveVariant, selectSessions, filterDrills, filterSessions, isoWeek, periodStats, drillProblems, duplicateDrill, migrateDrill, migrateDrills, moveIndex, rankDrills, newDrill, LOCAL_AUTHOR, upsertDrill, validateDb } from './model'
import { sihfPlan } from './sihf'
import type { Db, Drill } from './types'

const drill = (over: Partial<Drill> = {}): Drill => ({
  ...newDrill(),
  title: 'Give and Go',
  description: 'Zu zweit',
  keyPoints: ['Sofort anbieten'],
  categories: ['EF05', 'EF07'],
  primary: 'EF07',
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

test('drills without author get the coach, or the federation or site of their source', () => {
  const by = (source?: string, author?: string) => migrateDrill(drill({ source, author })).author
  expect(by(undefined)).toBe(LOCAL_AUTHOR)
  expect(by('https://hockeyakademin.se/ovningar/x')).toBe('Svenska Ishockeyförbundet')
  expect(by('https://cdn3.sportngin.com/a.pdf#page=2')).toBe('USA Hockey')
  expect(by('https://www.example.org/drill')).toBe('example.org')
  expect(by('https://blob.iihf.com/x.pdf', '')).toBe('') // cleared by the coach
  const db = { ...emptyDb(), drills: [drill({ source: 'https://video.hockeycanada.ca/x', author: undefined })] }
  expect(migrateDrills(db).drills[0].author).toBe('Hockey Canada')
  expect(migrateDrills({ ...db, players: undefined }).players).toBeUndefined() // no dummy team for imports
})

test('category collections follow the drills\' Erscheinungsformen', () => {
  const db = sample()
  const auto = categoryCollections(db)
  expect(auto).toHaveLength(9)
  expect(auto.find((c) => c.id === 'EF05')?.drillIds).toEqual([db.drills[0].id])
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
  expect(filterDrills(db.drills, '', 'EF07', 'U02', '')).toHaveLength(1)
  expect(filterDrills(db.drills, '', '', 'D01', '')).toHaveLength(0)
  expect(filterDrills([...db.drills, drill({ author: 'Hockey Canada' })], 'hockey canada', '', '', '')).toHaveLength(1)
  expect(filterDrills([drill({ ages: ['U10', 'U12'] }), drill({ ages: ['U14'] }), drill()], '', '', '', '', 'U12')).toHaveLength(1)
  const ranked = rankDrills([drill({ id: 'a', draft: true }), drill({ id: 'b', draft: false }), drill({ id: 'c', draft: true, primary: 'EF05' })], 'EF05')
  expect(ranked.map((d) => d.id)).toEqual(['c', 'b', 'a'])
  expect(filterSessions(db.sessions, '', 'EF07', '')).toHaveLength(1)
  expect(filterSessions(db.sessions, '', '', 'B01')).toHaveLength(0)
  expect(filterSessions(db.sessions, 'sofort anbieten', '', '')).toHaveLength(1)
})

test('periodStats splits definitive and planned trainings per period and skips undated ones', () => {
  const [s] = sample().sessions
  const rows = periodStats([s, { ...s, id: 'f', final: true }, { ...s, id: 'u', date: undefined }], isoWeek)
  expect(rows).toEqual([{ period: '2026-W42', final: { count: 1, minutes: 26 }, planned: { count: 1, minutes: 26 } }])
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
  expect(rows.find((r) => r.category === 'EF05')?.total).toBe(12) // 2 entries × 12 min, half each to EF05 and EF07
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
  expect(added).toEqual({ drills: 2, collections: 1, sessions: 0, players: 0, plans: 0, games: 0 }) // the collection was combined, not copied
  expect(db.drills.map((d) => d.title)).toEqual(['Give and Go', 'Geändert (Import)', 'Neu'])
  expect(db.collections).toHaveLength(1)
  expect(db.collections[0].drillIds).toEqual([mine.drills[0].id, db.drills[1].id, 'new']) // original kept, copy and new drill appended
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

test('Posten add up inside a block; 2 min changeover between blocks, none between Posten', () => {
  const d = drill({ minutes: 12 })
  const base = addEntries({ id: 's', title: 'T', start: '17:00', entries: [] }, [{ ...d, minutes: 7 }, d, d, d, { ...d, minutes: 5 }])
  const e = base.entries
  const parallel = { ...base, entries: [e[0], e[1], { ...e[2], parallel: true }, { ...e[3], parallel: true }, e[4]] }
  expect(blocks(parallel).map((b) => b.length)).toEqual([1, 3, 1])
  expect(totalMinutes(parallel)).toBe(7 + 2 + 36 + 2 + 5)
  expect(timeline(parallel).map((b) => `${clock('17:00', b.from)}-${clock('17:00', b.to)}`)).toEqual(['17:00-17:07', '17:09-17:45', '17:47-17:52'])
  expect(totalMinutes(base)).toBe(7 + 36 + 5 + 4 * 2) // five separate exercises, four changes
  expect(totalMinutes({ ...base, entries: [{ ...e[0], parallel: true }] })).toBe(7) // a first entry cannot join a block
  expect(totalMinutes({ ...base, entries: [] })).toBe(0)
  expect(clock('23:50', 20)).toBe('00:10')
})

test('needs adds players of parallel Posten and lists material once', () => {
  const a = drill({ players: 4, goalies: 1, material: 'Pucks' })
  const b = drill({ players: 6, material: 'Pucks' })
  const s = addEntries({ id: 's', title: 'T', entries: [] }, [a, b])
  expect(needs(s)).toEqual({ players: 6, goalies: 1, material: ['Pucks'] })
  expect(needs({ ...s, entries: [s.entries[0], { ...s.entries[1], parallel: true }] }).players).toBe(10)
})

test('the SIHF Jahresablauf is read completely: 39 weeks, 102 trainings, both breaks', () => {
  expect(sihfPlan.filter((w) => w.phase === 'Off-Ice Saison')).toHaveLength(10)
  expect(sihfPlan.filter((w) => w.phase === 'Eissaison')).toHaveLength(29)
  expect(sihfPlan.flatMap((w) => w.trainings)).toHaveLength(102)
  expect(sihfPlan.filter((w) => w.breakAfter).map((w) => `${w.phase} ${w.week} ${w.breakAfter}`)).toEqual(['Off-Ice Saison 10 Sommerpause', 'Eissaison 18 Weihnachtspause'])
  const camp = sihfPlan.find((w) => w.special === 'Trainingslager')!
  expect([camp.trainings.length, camp.personality]).toEqual([8, ['V07', 'V15', 'V16', 'V17', 'V18']])
  expect(sihfPlan.find((w) => w.phase === 'Eissaison' && w.week === 2)).toMatchObject({ month: 'August', trainings: ['D02', 'D03', 'P05'], offIce: ['O01'], personality: ['V02'] })
})

test('a new season plan has the SIHF weeks; the full one rebuilds every training', () => {
  const empty = newPlan('Saison')
  expect(empty.weeks).toHaveLength(39)
  expect(empty.weeks.every((w) => !w.trainings.length && !w.offIce.length && !w.personality.length)).toBe(true)
  expect(empty.weeks[9].breakAfter).toBe('Sommerpause')
  expect(newPlan('SIHF', true).weeks.flatMap((w) => w.trainings)).toHaveLength(102)
})

test('fillDates dates the rest of the phase one week apart', () => {
  const p = newPlan('Saison')
  const ice = p.weeks.findIndex((w) => w.phase === 'Eissaison')
  const weeks = fillDates(p.weeks.map((w, i) => (i === 8 || i === ice ? { ...w, monday: i === 8 ? '2026-07-06' : '2026-08-10' } : w)), p.weeks[8].id)
  expect(weeks[9].monday).toBe('2026-07-13')
  expect(weeks[ice].monday).toBe('2026-08-10') // the next phase keeps its own start
  expect(fillDates(weeks, weeks[ice].id).at(-1)!.monday).toBe(addDays('2026-08-10', 28 * 7))
})

test('a week shows the trainings dated in it and the Schlüsselelemente they cover', () => {
  const [s] = sample().sessions // dated 2026-10-13, drill with U02
  expect(sessionsInWeek([s, { ...s, id: 't', template: true }], '2026-10-12').map((x) => x.id)).toEqual([s.id])
  expect(sessionsInWeek([s], '2026-10-14')).toEqual([])
  expect([...coveredElements([s])]).toEqual(['U02'])
})

test('team and season plan survive a backup round trip and are checked on import', () => {
  const db = { ...sample(), players: dummyTeam(), plans: [newPlan('SIHF', true)] }
  db.sessions[0].attendance = [db.players[0].id]
  expect(roundTrip(db)).toEqual(db)
  expect(() => roundTrip({ ...db, sessions: [{ ...db.sessions[0], attendance: ['nobody'] }] })).toThrow()
  const bad = structuredClone(db.plans[0])
  bad.weeks[0].trainings = [['X99']]
  expect(() => roundTrip({ ...db, plans: [bad] })).toThrow()
  expect(() => roundTrip(sample())).not.toThrow() // backups without team/plans stay valid
})

test('existing data gets the 20-player starting team once', () => {
  const team = migrateDb(sample()).players!
  expect(team.map((p) => p.position).join('')).toBe('GG' + 'D'.repeat(6) + 'F'.repeat(12))
  expect(migrateDb({ ...sample(), players: [] }).players).toEqual([])
})

test('toIcs exports dated trainings with times, escaping and folding', () => {
  const d = drill({ title: 'Pass, Schuss; Tor' })
  const timed = { ...addEntries({ id: 's1', title: 'Dienstag', date: '2026-10-13', start: '17:30', final: true, notes: 'Fokus\nPassen', entries: [] }, [d]) }
  const allDay = { id: 's2', title: 'Ä'.repeat(60), date: '2026-10-14', entries: [] }
  const ics = toIcs([timed, allDay, { id: 't', title: 'Vorlage', template: true, date: '2026-10-15', entries: [] }, { id: 'u', title: 'Ohne Datum', entries: [] }], [], new Date('2026-10-15T08:09:10Z'))
  const lines = ics.split('\r\n')
  expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
  expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(2)
  expect(lines).toContain('DTSTAMP:20261015T080910Z')
  expect(lines).toContain('DTSTART:20261013T173000')
  expect(lines).toContain('DURATION:PT12M')
  expect(lines).toContain('STATUS:CONFIRMED')
  expect(lines).toContain('DESCRIPTION:Pass\\, Schuss\\; Tor (12 Min.)\\nFokus\\nPassen')
  expect(lines).toContain('DTSTART;VALUE=DATE:20261014')
  expect(lines).toContain('STATUS:TENTATIVE')
  expect(lines.every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true)
  expect(ics.replace(/\r\n /g, '')).toContain(`SUMMARY:${'Ä'.repeat(60)}`)
})

test('toIcs exports dated games as 2-hour events', () => {
  const lines = toIcs([], [{ id: 'g', opponent: 'EHC Chur', away: true, date: '2026-10-18', start: '14:00', lineup: {} }, { id: 'h', opponent: 'X', lineup: {} }]).split('\r\n')
  expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1)
  expect(lines).toContain('SUMMARY:Spiel: Auswärts bei EHC Chur')
  expect(lines).toContain('DURATION:PT120M')
})

test('line-up: a player holds one slot; removing a player clears line-ups and attendance', () => {
  let l = setSlot({}, 'F1-C', 'p1')
  l = setSlot(l, 'F1-LW', 'p2')
  l = setSlot(l, 'F2-C', 'p1') // moves p1
  expect(l).toEqual({ 'F1-LW': 'p2', 'F2-C': 'p1' })
  expect(setSlot(l, 'F1-LW', '')).toEqual({ 'F2-C': 'p1' })
  const db = { ...sample(), players: [{ id: 'p1', name: 'A', position: 'F' as const }, { id: 'p2', name: 'B', position: 'F' as const }] }
  db.sessions[0].attendance = ['p1', 'p2']
  const after = removePlayer({ ...db, games: [{ id: 'g', opponent: 'Chur', lineup: l }] }, 'p1')
  expect(after.games![0].lineup).toEqual({ 'F1-LW': 'p2' })
  expect(after.sessions[0].attendance).toEqual(['p2'])
  expect(after.players!.map((p) => p.id)).toEqual(['p2'])
  expect(() => validateDb(after)).not.toThrow()
  expect(() => validateDb({ ...after, games: [{ id: 'g', opponent: 'Chur', lineup: { 'F1-LW': 'p1' } }] })).toThrow('Aufstellung')
  expect(() => validateDb({ ...after, games: [{ id: 'g', opponent: 'Chur', lineup: { X9: 'p2' } }] })).toThrow('Aufstellung')
  expect(gameTitle({ id: 'g', opponent: 'Chur', lineup: {} })).toBe('Heim gegen Chur')
})

test('imported drills: source must be http(s), image https or an inline image', () => {
  const ok = (d: Partial<Drill>) => () => validateDb({ ...sample(), drills: [drill(d)], collections: [] })
  expect(ok({ source: 'https://www.mobilesport.ch/?p=1335', image: 'https://www.mobilesport.ch/a.jpg' })).not.toThrow()
  expect(ok({ image: 'data:image/png;base64,iVBORw0KGgo=' })).not.toThrow()
  expect(ok({ source: 'javascript:alert(1)' })).toThrow('Quelle')
  expect(ok({ image: 'http://example.com/a.jpg' })).toThrow('Bild')
  expect(ok({ image: 'data:text/html;base64,PHNjcmlwdD4=' })).toThrow('Bild')
})
