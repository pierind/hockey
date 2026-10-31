import { mid, uid } from './scene'
import { categories, elements, goals, sihfPlan } from './sihf'
import { AGE_CLASSES, ROUTE_LABELS, SYMBOL_LABELS } from './types'
import type { Collection, Db, Drill, Game, Item, PlanWeek, Player, Pt, SeasonPlan, Session, SessionEntry } from './types'

export type Change = (fn: (db: Db) => Db) => Promise<void>

export const emptyDb = (): Db => ({ version: 1, drills: [], collections: [], sessions: [], players: dummyTeam(), plans: [], games: [] })

// Starting team: 20 placeholder players (2 G, 6 D, 12 F) split into two groups, renamed by the coach.
export const dummyTeam = (): Player[] =>
  Array.from({ length: 20 }, (_, i) => ({
    id: uid(),
    name: `Spieler/in ${i + 1}`,
    number: i + 1,
    position: i < 2 ? 'G' : i < 8 ? 'D' : 'F',
    group: i % 2 ? 'Weiss' : 'Blau',
  }))

// Season plan with the SIHF weeks (10 off-ice + 29 ice weeks, same months and breaks); full = with all SIHF goals.
export const newPlan = (name: string, full = false): SeasonPlan => ({
  id: uid(),
  name,
  weeks: sihfPlan.map((w) => ({
    ...(full ? { ...w, trainings: w.trainings.map((t) => [t]) } : { phase: w.phase, week: w.week, month: w.month, breakAfter: w.breakAfter, trainings: [] as string[][], offIce: [], personality: [] }),
    id: uid(),
  })),
})

export const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
// Dates the weeks after `weekId` in the same phase one week apart; after a break, set the next week and fill again.
export function fillDates(weeks: PlanWeek[], weekId: string): PlanWeek[] {
  const i = weeks.findIndex((w) => w.id === weekId)
  const start = weeks[i]?.monday
  if (!start) return weeks
  return weeks.map((w, j) => (j > i && w.phase === weeks[i].phase ? { ...w, monday: addDays(start, (j - i) * 7) } : w))
}
// Standard line-up: 4 forward lines, 3 defence pairs, starting and backup goalie.
// shortcut: fixed slot count; make it configurable if a team plays with fewer or more lines.
export const LINEUP_SLOTS: { line: string; slots: [id: string, label: string][] }[] = [
  ...[1, 2, 3, 4].map((n) => ({ line: `${n}. Sturm`, slots: [[`F${n}-LW`, 'LW'], [`F${n}-C`, 'C'], [`F${n}-RW`, 'RW']] as [string, string][] })),
  ...[1, 2, 3].map((n) => ({ line: `${n}. Verteidigung`, slots: [[`D${n}-LD`, 'LD'], [`D${n}-RD`, 'RD']] as [string, string][] })),
  { line: 'Tor', slots: [['G1', 'Starter'], ['G2', 'Ersatz']] },
]
const SLOT_IDS = new Set(LINEUP_SLOTS.flatMap((l) => l.slots.map(([id]) => id)))
// A player holds at most one slot: putting them in a new slot clears their old one. Empty player clears the slot.
export function setSlot(lineup: Record<string, string>, slot: string, player: string) {
  const next = Object.fromEntries(Object.entries(lineup).filter(([k, v]) => k !== slot && v !== player))
  return player ? { ...next, [slot]: player } : next
}
// Removes a player from the team, every attendance list and every line-up.
export const removePlayer = (db: Db, id: string): Db => ({
  ...db,
  players: (db.players ?? []).filter((p) => p.id !== id),
  sessions: db.sessions.map((s) => (s.attendance ? { ...s, attendance: s.attendance.filter((x) => x !== id) } : s)),
  games: (db.games ?? []).map((g) => ({ ...g, lineup: Object.fromEntries(Object.entries(g.lineup).filter(([, v]) => v !== id)) })),
})
export const gameTitle = (g: Game) => `${g.away ? 'Auswärts bei' : 'Heim gegen'} ${g.opponent || '?'}`

// Players by group (in first-seen order), e.g. [['Blau', [...]], ['Weiss', [...]]].
export function groupPlayers(players: Player[]): [string, Player[]][] {
  const groups = new Map<string, Player[]>()
  for (const p of players) groups.set(p.group || 'Ohne Gruppe', [...(groups.get(p.group || 'Ohne Gruppe') ?? []), p])
  return [...groups]
}

// Trainings (not templates) dated within the 7 days from monday.
export const sessionsInWeek = (sessions: Session[], monday: string) =>
  sessions.filter((s) => !s.template && s.date && s.date >= monday && s.date <= addDays(monday, 6))
// Schlüsselelemente the drills of these trainings cover.
export const coveredElements = (sessions: Session[]) => new Set(sessions.flatMap((s) => s.entries.flatMap((e) => e.drill.elements)))

export const newDrill = (): Drill => ({
  id: uid(),
  title: '',
  description: '',
  keyPoints: [''],
  categories: [],
  elements: [],
  offIce: false,
  draft: true,
  scene: { rink: 'full', items: [] },
  author: LOCAL_AUTHOR,
  updatedAt: '',
})

export const badNumber = (m?: number) => m !== undefined && !(Number.isFinite(m) && m >= 0)

// What is missing before a drill counts as completed (drafts may skip these).
export const drillProblems = (d: Drill) =>
  [
    !d.title.trim() && 'Titel',
    !d.description.trim() && 'Beschreibung',
    !d.keyPoints.some((k) => k.trim()) && 'mindestens ein Coaching-Punkt',
    !d.categories.length && 'mindestens eine Erscheinungsform',
  ].filter((p): p is string => !!p)

// shortcut: one hardcoded coach, the app has no user accounts; add a setting if other coaches use it.
export const LOCAL_AUTHOR = 'Pierin Derungs'
// Author of an imported drill by the host of its source (see scripts/import-*.mjs); sportngin.com hosts the USA Hockey PDFs.
const AUTHORS: [RegExp, string][] = [
  [/hockeyakademin\.se$/, 'Svenska Ishockeyförbundet'],
  [/hockeycanada\.ca$/, 'Hockey Canada'],
  [/(usahockey|admkids|sportngin)\.com$/, 'USA Hockey'],
  [/iihf\.com$/, 'IIHF'],
  [/hockeyshare\.com$/, 'HockeyShare'],
  [/mobilesport\.ch$/, 'BASPO / J+S (mobilesport.ch)'],
]
export function authorOf(source?: string) {
  if (!source) return LOCAL_AUTHOR
  const host = new URL(source).hostname
  return AUTHORS.find(([re]) => re.test(host))?.[1] ?? host.replace(/^www\./, '')
}

// Spielfeldbegrenzung lines were replaced by the Toblerone (2026-10-11); convert them so drills saved before still open.
// shortcut: only data already in this browser is converted, old backup files are rejected on import; drop once no old data exists.
export function migrateDrill(d: Drill): Drill {
  const items = d.scene.items.map((it) => {
    const old = it as unknown as { id: string; kind: string; from: Pt; to: Pt }
    if (old.kind !== 'boundary') return it
    const rot = Math.round((Math.atan2(old.to[1] - old.from[1], old.to[0] - old.from[0]) * 180) / Math.PI / 15) * 15
    return { id: old.id, kind: 'toblerone', at: mid(old.from, old.to), rot } as Item
  })
  // Drills from before the author field (2026-10-31) get one; a cleared author stays empty.
  return { ...d, author: d.author ?? authorOf(d.source), scene: { ...d.scene, items } }
}
// Drills only, so an imported backup is migrated like the stored data without gaining a dummy team.
export const migrateDrills = (db: Db): Db => ({
  ...db,
  drills: db.drills.map(migrateDrill),
  sessions: db.sessions.map((s) => ({ ...s, entries: s.entries.map((e) => ({ ...e, drill: migrateDrill(e.drill) })) })),
})
export const migrateDb = (db: Db): Db => ({
  ...migrateDrills(db),
  players: db.players ?? dummyTeam(),
  plans: db.plans ?? [],
  games: db.games ?? [],
})

// One read-only collection per Erscheinungsform, derived from the drills' categories so it never goes stale.
export const categoryCollections = (db: Db): Collection[] =>
  categories.map((c) => ({ id: c.id, name: c.label, drillIds: db.drills.filter((d) => d.categories.includes(c.id)).map((d) => d.id) }))

// Saves an edited training entry as its own library drill and points only that entry at it.
export const saveVariant = (db: Db, sessionId: string, entryId: string, d: Drill): Db => ({
  ...upsertDrill(db, d),
  sessions: db.sessions.map((s) =>
    s.id !== sessionId ? s : { ...s, entries: s.entries.map((e) => (e.id === entryId ? { ...e, drill: structuredClone(d) } : e)) }),
})

export const upsertDrill = (db: Db, d: Drill): Db => ({
  ...db,
  drills: db.drills.some((x) => x.id === d.id) ? db.drills.map((x) => (x.id === d.id ? d : x)) : [...db.drills, d],
})

// Collections lose the reference; sessions keep their snapshots.
export const deleteDrill = (db: Db, id: string): Db => ({
  ...db,
  drills: db.drills.filter((d) => d.id !== id),
  collections: db.collections.map((c) => ({ ...c, drillIds: c.drillIds.filter((x) => x !== id) })),
})

export const duplicateDrill = (d: Drill): Drill => ({
  ...structuredClone(d),
  id: uid(),
  title: `${d.title} (Kopie)`,
  updatedAt: new Date().toISOString(),
})

export const addEntries = (s: Session, drills: Drill[]): Session => ({
  ...s,
  entries: [...s.entries, ...drills.map((d) => ({ id: uid(), drill: structuredClone(d), minutes: d.minutes ?? 10, notes: '' }))],
})

export const duplicateSession = (s: Session): Session => ({
  ...structuredClone(s),
  id: uid(),
  title: `${s.title} (Kopie)`,
  final: undefined, // a copy starts as a plan
  entries: s.entries.map((e) => ({ ...structuredClone(e), id: uid() })),
})

// Adds an imported backup to the current data without overwriting anything. Identical records (same id and
// content) are skipped; a drill or training whose id exists with different content is added as a copy «(Import)»,
// and collections point at those copies.
export function mergeDb(current: Db, incoming: Db) {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  const added = { drills: 0, collections: 0, sessions: 0, players: 0, plans: 0, games: 0 }
  let skipped = 0
  const drillIds = new Map<string, string>() // imported id -> id used here
  function add<T extends { id: string }>(list: T[], items: T[], kind: keyof typeof added, rename: (x: T) => T, onCopy?: (from: string, to: string) => void) {
    const out = [...list]
    for (const x of items) {
      const existing = list.find((y) => y.id === x.id)
      if (existing && same(existing, x)) {
        skipped++
        continue
      }
      const copy = existing ? { ...rename(x), id: uid() } : x
      if (existing) onCopy?.(x.id, copy.id)
      out.push(copy)
      added[kind]++
    }
    return out
  }
  const drills = add(current.drills, incoming.drills, 'drills', (d) => ({ ...d, title: `${d.title} (Import)` }), (from, to) => drillIds.set(from, to))
  // A collection that exists on both sides is combined: its missing drills are appended, nothing is removed.
  const collections = [...current.collections]
  for (const c of incoming.collections) {
    const ids = c.drillIds.map((id) => drillIds.get(id) ?? id)
    const i = collections.findIndex((x) => x.id === c.id)
    if (i < 0) {
      collections.push({ ...c, drillIds: ids })
      added.collections++
      continue
    }
    const extra = ids.filter((id) => !collections[i].drillIds.includes(id))
    if (!extra.length) {
      skipped++
      continue
    }
    collections[i] = { ...collections[i], drillIds: [...collections[i].drillIds, ...extra] }
    added.collections++
  }
  const sessions = add(current.sessions, incoming.sessions, 'sessions', (s) => ({ ...s, title: `${s.title} (Import)` }))
  const players = add(current.players ?? [], incoming.players ?? [], 'players', (p) => ({ ...p, name: `${p.name} (Import)` }))
  const plans = add(current.plans ?? [], incoming.plans ?? [], 'plans', (p) => ({ ...p, name: `${p.name} (Import)` }))
  const games = add(current.games ?? [], incoming.games ?? [], 'games', (g) => ({ ...g, opponent: `${g.opponent} (Import)` }))
  return { db: { ...current, drills, collections, sessions, players, plans, games }, added, skipped }
}

// New training from a template or an earlier training: fresh ids, no date, starts as a plan.
export const fromTemplate = (s: Session): Session => ({ ...duplicateSession(s), title: s.title, date: undefined, template: undefined })

// Consecutive entries joined by `parallel` form one Posten-Block.
export function blocks(s: Session): SessionEntry[][] {
  const out: SessionEntry[][] = []
  s.entries.forEach((e, i) => (i && e.parallel ? out[out.length - 1].push(e) : out.push([e])))
  return out
}
// Changeover between consecutive exercises/blocks; rotating between Posten inside a block has none.
export const CHANGE_MINUTES = 2
// Every group visits every Posten, so a block takes the sum: the time each player spends at each exercise.
export const blockMinutes = (b: SessionEntry[]) => b.reduce((sum, e) => sum + e.minutes, 0)

// Blocks with their start/end in minutes from the training start, changeovers included.
export function timeline(s: Session) {
  let t = 0
  return blocks(s).map((entries, i) => {
    const from = (t += i ? CHANGE_MINUTES : 0)
    t += blockMinutes(entries)
    return { entries, from, to: t }
  })
}
export const totalMinutes = (s: Session) => timeline(s).at(-1)?.to ?? 0
// 'HH:MM' plus minutes, wrapping at midnight.
export function clock(start: string, minutes: number) {
  const [h, m] = start.split(':').map(Number)
  const t = (((h * 60 + m + Math.round(minutes)) % 1440) + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

// What a training needs: Posten in one block run at the same time, so they add up; the busiest block decides.
export function needs(s: Session) {
  const most = (k: 'players' | 'goalies') => Math.max(0, ...blocks(s).map((b) => b.reduce((n, e) => n + (e.drill[k] ?? 0), 0)))
  const material = [...new Set(s.entries.map((e) => e.drill.material?.trim()).filter((m): m is string => !!m))]
  return { players: most('players'), goalies: most('goalies'), material }
}

export function moveIndex<T>(list: T[], from: number, to: number): T[] {
  const next = [...list]
  next.splice(to, 0, ...next.splice(from, 1))
  return next
}

const has = (texts: string[], needle: string) => !needle || texts.some((t) => t.toLowerCase().includes(needle))
const tagged = (d: Drill, category: string, element: string) =>
  (!category || d.categories.includes(category)) && (!element || d.elements.includes(element))

export function filterDrills(drills: Drill[], q: string, category: string, element: string, place: '' | 'on' | 'off', age = '') {
  const needle = q.trim().toLowerCase()
  return drills.filter(
    (d) => tagged(d, category, element) && (!place || d.offIce === (place === 'off')) && (!age || !!d.ages?.includes(age)) && has([d.title, d.description, ...d.keyPoints, d.author ?? ''], needle),
  )
}

// Suggestion order: drills focused on the chosen Erscheinungsform, then completed ones (own drills; imports stay drafts), then ones with a picture.
export function rankDrills(drills: Drill[], category: string) {
  const score = (d: Drill) => (category && d.primary === category ? 4 : 0) + (d.draft ? 0 : 2) + (d.scene.items.length || d.image ? 1 : 0)
  return [...drills].sort((a, b) => score(b) - score(a))
}

// A training matches when its title/notes or one of its drills match, and one drill carries the category/element.
export function filterSessions(sessions: Session[], q: string, category: string, element: string) {
  const needle = q.trim().toLowerCase()
  return sessions.filter(
    (s) =>
      (!(category || element) || s.entries.some((e) => tagged(e.drill, category, element))) &&
      (has([s.title, s.notes ?? '', ...s.entries.flatMap((e) => [e.notes, e.drill.title, e.drill.description, ...e.drill.keyPoints])], needle)),
  )
}

// ISO 8601 week of a 'YYYY-MM-DD' date, e.g. '2025-W49' (sorts chronologically).
export function isoWeek(date: string) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7)) // Thursday of the same week decides the year
  const week = Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
export const monthKey = (date: string) => date.slice(0, 7)
export const monthLabel = (key: string) =>
  new Intl.DateTimeFormat('de-CH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`))

export type StatusFilter = '' | 'final' | 'planned'
// Dated trainings (not templates) within [from, to] (inclusive, 'YYYY-MM-DD', empty = open) with the given status.
export const selectSessions = (sessions: Session[], status: StatusFilter, from: string, to: string) =>
  sessions.filter((s) => s.date && !s.template && (!from || s.date >= from) && (!to || s.date <= to) && (!status || (status === 'final') === !!s.final))

// Minutes per Erscheinungsform and period. A drill with several Erscheinungsformen splits its minutes equally,
// so the rows add up to the trainings' total; drills without one count under ''. All nine categories are listed.
export function categoryMinutes(sessions: Session[], key: (date: string) => string) {
  const periods = new Set<string>()
  const minutes = new Map<string, Record<string, number>>()
  for (const s of sessions) {
    if (!s.date) continue
    const p = key(s.date)
    periods.add(p)
    for (const e of s.entries) {
      const cats = e.drill.categories.length ? e.drill.categories : ['']
      for (const c of cats) {
        const row = minutes.get(c) ?? {}
        row[p] = (row[p] ?? 0) + e.minutes / cats.length
        minutes.set(c, row)
      }
    }
  }
  const ids = [...categories.map((c) => c.id), ...(minutes.has('') ? [''] : [])]
  return {
    periods: [...periods].sort(),
    rows: ids.map((category) => {
      const byPeriod = minutes.get(category) ?? {}
      return { category, byPeriod, total: Object.values(byPeriod).reduce((a, b) => a + b, 0) }
    }),
  }
}

type Tally = { count: number; minutes: number }
export type PeriodStat = { period: string; final: Tally; planned: Tally }
// Trainings per week or month, split into definitive and planned (draft). Undated trainings are left out.
export function periodStats(sessions: Session[], key: (date: string) => string): PeriodStat[] {
  const rows = new Map<string, PeriodStat>()
  for (const s of sessions) {
    if (!s.date) continue
    const k = key(s.date)
    const row = rows.get(k) ?? { period: k, final: { count: 0, minutes: 0 }, planned: { count: 0, minutes: 0 } }
    const t = s.final ? row.final : row.planned
    t.count++
    t.minutes += totalMinutes(s)
    rows.set(k, row)
  }
  return [...rows.values()].sort((a, b) => a.period.localeCompare(b.period))
}

// --- Backup validation: imported files are untrusted, so check everything before replacing data.

type Obj = Record<string, unknown>
const SYMBOLS: string[] = Object.keys(SYMBOL_LABELS)
const STYLES: string[] = Object.keys(ROUTE_LABELS)
const RINKS = ['full', 'half', 'zone']
const CATEGORY_IDS = new Set(categories.map((c) => c.id))
const ELEMENT_IDS = new Set(elements.map((e) => e.id))

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isPt = (v: unknown) => Array.isArray(v) && v.length === 2 && v.every(isNum)
const strs = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr)
const opt = (v: unknown, ok: (v: unknown) => boolean) => v === undefined || ok(v)
const unique = (ids: unknown[]) => new Set(ids).size === ids.length

function need(ok: boolean, msg: string): asserts ok {
  if (!ok) throw new Error(msg)
}

function checkItem(it: unknown, w: string) {
  need(isObj(it) && isStr(it.id), `${w}: ungültiges Element`)
  if (SYMBOLS.includes(it.kind as string)) need(isPt(it.at) && opt(it.rot, isNum) && opt(it.label, isStr), w)
  else if (it.kind === 'route') need(STYLES.includes(it.style as string) && isPt(it.from) && isPt(it.to) && opt(it.ctrl, isPt) && opt(it.via, (v) => Array.isArray(v) && v.every(isPt)), w)
  else if (it.kind === 'free') need(Array.isArray(it.pts) && it.pts.every(isPt), w)
  else if (it.kind === 'text') need(isPt(it.at) && isStr(it.text), w)
  else need(false, `${w}: unbekannter Typ «${String(it.kind)}»`)
}

function checkDrill(d: unknown, w: string) {
  need(isObj(d) && isStr(d.id) && isStr(d.title) && isStr(d.description) && strs(d.keyPoints) && isStr(d.updatedAt), `${w}: Felder fehlen`)
  need(strs(d.categories) && d.categories.every((c) => CATEGORY_IDS.has(c)), `${w}: unbekannte Erscheinungsform`)
  const cats = d.categories
  need(opt(d.primary, (p) => cats.includes(p as string)), `${w}: ungültiger Hauptfokus`)
  need(strs(d.elements) && d.elements.every((e) => ELEMENT_IDS.has(e)), `${w}: unbekanntes Schlüsselelement`)
  need(opt(d.ages, (a) => strs(a) && a.every((x) => AGE_CLASSES.includes(x))), `${w}: unbekannte Altersklasse`)
  need(opt(d.minutes, (m) => isNum(m) && m >= 0), `${w}: ungültige Dauer`)
  need(opt(d.players, (m) => isNum(m) && m >= 0) && opt(d.goalies, (m) => isNum(m) && m >= 0) && opt(d.material, isStr), `${w}: ungültige Angaben zu Spieler/innen oder Material`)
  need(opt(d.author, isStr), `${w}: ungültige Autor/in`)
  need(typeof d.offIce === 'boolean' && typeof d.draft === 'boolean', `${w}: Felder fehlen`)
  // Imported files are untrusted: only http(s) links and inline images, never javascript: or other schemes.
  need(opt(d.source, (s) => isStr(s) && /^https?:\/\//.test(s)) && opt(d.image, (s) => isStr(s) && /^(https:\/\/|data:image\/(png|jpeg|gif|webp);base64,)/.test(s)), `${w}: ungültige Quelle oder ungültiges Bild`)
  need(isObj(d.scene) && RINKS.includes(d.scene.rink as string) && Array.isArray(d.scene.items), `${w}: ungültiges Diagramm`)
  d.scene.items.forEach((it, i) => checkItem(it, `${w}, Element ${i + 1}`))
  need(unique(d.scene.items.map((it: Obj) => it.id)), `${w}: doppelte Element-IDs`)
}

export function validateDb(x: unknown): Db {
  need(isObj(x), 'Keine gültige Backup-Datei')
  need(x.version === 1, `Unbekannte Backup-Version: ${String(x.version)}`)
  need(Array.isArray(x.drills) && Array.isArray(x.collections) && Array.isArray(x.sessions), 'Backup unvollständig')
  x.drills.forEach((d, i) => checkDrill(d, `Übung ${i + 1}`))
  const drillIds = new Set(x.drills.map((d: Obj) => d.id))
  need(drillIds.size === x.drills.length, 'Doppelte Übungs-IDs')
  x.collections.forEach((c, i) => {
    need(isObj(c) && isStr(c.id) && isStr(c.name) && opt(c.description, isStr) && strs(c.drillIds), `Sammlung ${i + 1}: Felder fehlen`)
    need(c.drillIds.every((id) => drillIds.has(id)), `Sammlung ${i + 1}: verweist auf fehlende Übung`)
  })
  x.sessions.forEach((s, i) => {
    need(isObj(s) && isStr(s.id) && isStr(s.title) && opt(s.date, isStr) && opt(s.final, (f) => typeof f === 'boolean') && opt(s.notes, isStr) && opt(s.template, (t) => typeof t === 'boolean') && opt(s.start, (t) => isStr(t) && /^\d{2}:\d{2}$/.test(t)) && Array.isArray(s.entries), `Training ${i + 1}: Felder fehlen`)
    s.entries.forEach((e, j) => {
      const w = `Training ${i + 1}, Eintrag ${j + 1}`
      need(isObj(e) && isStr(e.id) && isNum(e.minutes) && e.minutes >= 0 && isStr(e.notes) && opt(e.parallel, (b) => typeof b === 'boolean'), `${w}: Felder fehlen`)
      checkDrill(e.drill, w)
    })
    need(unique(s.entries.map((e: Obj) => e.id)), `Training ${i + 1}: doppelte Eintrags-IDs`)
  })
  need(opt(x.players, Array.isArray) && opt(x.plans, Array.isArray), 'Backup unvollständig')
  const players = (x.players ?? []) as unknown[]
  players.forEach((p, i) =>
    need(isObj(p) && isStr(p.id) && isStr(p.name) && opt(p.number, isNum) && ['F', 'D', 'G'].includes(p.position as string) && opt(p.group, isStr), `Spieler/in ${i + 1}: Felder fehlen`))
  const playerIds = new Set(players.map((p) => (p as Obj).id))
  x.sessions.forEach((s: Obj, i) => need(opt(s.attendance, (a) => strs(a) && a.every((id) => playerIds.has(id))), `Training ${i + 1}: Anwesenheit verweist auf unbekannte Spieler/in`))
  need(opt(x.games, Array.isArray), 'Backup unvollständig')
  const games = (x.games ?? []) as unknown[]
  games.forEach((g, i) =>
    need(isObj(g) && isStr(g.id) && isStr(g.opponent) && opt(g.away, (b) => typeof b === 'boolean') && opt(g.date, isStr) && opt(g.start, (t) => isStr(t) && /^\d{2}:\d{2}$/.test(t)) && opt(g.notes, isStr)
      && isObj(g.lineup) && Object.entries(g.lineup).every(([k, v]) => SLOT_IDS.has(k) && playerIds.has(v)), `Spiel ${i + 1}: Felder fehlen oder ungültige Aufstellung`))
  const known = new Set([...ELEMENT_IDS, ...goals.map((g) => g.id)])
  const codes = (v: unknown) => strs(v) && v.every((c) => known.has(c))
  ;((x.plans ?? []) as unknown[]).forEach((p, i) => {
    const w = `Saisonplan ${i + 1}`
    need(isObj(p) && isStr(p.id) && isStr(p.name) && Array.isArray(p.weeks), `${w}: Felder fehlen`)
    p.weeks.forEach((k: unknown, j) =>
      need(isObj(k) && isStr(k.id) && isStr(k.phase) && isNum(k.week) && opt(k.month, isStr) && opt(k.monday, isStr) && opt(k.special, isStr)
        && Array.isArray(k.trainings) && k.trainings.every(codes) && codes(k.offIce) && codes(k.personality) && opt(k.notes, isStr) && opt(k.breakAfter, isStr),
      `${w}, Woche ${j + 1}: ungültig`))
  })
  need(unique(x.collections.map((c: Obj) => c.id)) && unique(x.sessions.map((s: Obj) => s.id)) && playerIds.size === players.length && unique(games.map((g) => (g as Obj).id)), 'Doppelte IDs')
  return x as unknown as Db
}

// --- Calendar export (RFC 5545) of dated trainings; templates are left out.
// shortcut: floating local times without VTIMEZONE, so a device set to another time zone shows the same clock time; add Europe/Zurich if clubs abroad use it.
const icsText = (t: string) => t.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n')
// Lines over 75 bytes are folded (CRLF + space) without splitting a UTF-8 character.
function fold(line: string) {
  const out: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length
    if (bytes + n > 75) [out[out.length], cur, bytes] = [cur, ' ', 1]
    cur += ch
    bytes += n
  }
  return [...out, cur].join('\r\n')
}
// shortcut: a game is entered as 2 hours (3×20 min plus breaks); add a duration field if teams want it exact.
const GAME_MINUTES = 120
export function toIcs(sessions: Session[], games: Game[], now = new Date()) {
  const stamp = `${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`
  const event = (id: string, date: string, start: string | undefined, minutes: number, summary: string, description: string, status: string) => [
    'BEGIN:VEVENT',
    `UID:${id}@hockey-planner`, // stable, so importing again updates the event instead of duplicating it
    `DTSTAMP:${stamp}`,
    ...(start ? [`DTSTART:${date.replaceAll('-', '')}T${start.replace(':', '')}00`, `DURATION:PT${minutes}M`] : [`DTSTART;VALUE=DATE:${date.replaceAll('-', '')}`]),
    `SUMMARY:${icsText(summary)}`,
    ...(description ? [`DESCRIPTION:${icsText(description)}`] : []),
    `STATUS:${status}`,
    'END:VEVENT',
  ]
  const events = [
    ...sessions.filter((s) => s.date && !s.template).flatMap((s) => event(s.id, s.date!, s.start, totalMinutes(s), s.title,
      [...s.entries.map((e) => `${e.drill.title || 'Ohne Titel'} (${e.minutes} Min.)`), s.notes].filter(Boolean).join('\n'), s.final ? 'CONFIRMED' : 'TENTATIVE')),
    ...games.filter((g) => g.date).flatMap((g) => event(g.id, g.date!, g.start, GAME_MINUTES, `Spiel: ${gameTitle(g)}`, g.notes ?? '', 'CONFIRMED')),
  ]
  return [...['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//hockey-planner//DE', ...events, 'END:VCALENDAR'].map(fold), ''].join('\r\n')
}
