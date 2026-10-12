import { mid, uid } from './scene'
import { categories, elements } from './sihf'
import { ROUTE_LABELS, SYMBOL_LABELS } from './types'
import type { Collection, Db, Drill, Item, Pt, Session } from './types'

export type Change = (fn: (db: Db) => Db) => Promise<void>

export const emptyDb = (): Db => ({ version: 1, drills: [], collections: [], sessions: [] })

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
  updatedAt: '',
})

export const badMinutes = (m?: number) => m !== undefined && !(Number.isFinite(m) && m >= 0)

// What is missing before a drill counts as completed (drafts may skip these).
export const drillProblems = (d: Drill) =>
  [
    !d.title.trim() && 'Titel',
    !d.description.trim() && 'Beschreibung',
    !d.keyPoints.some((k) => k.trim()) && 'mindestens ein Coaching-Punkt',
    !d.categories.length && 'mindestens eine Erscheinungsform',
  ].filter((p): p is string => !!p)

// Spielfeldbegrenzung lines were replaced by the Toblerone (2026-10-11); convert them so drills saved before still open.
// shortcut: only data already in this browser is converted, old backup files are rejected on import; drop once no old data exists.
export function migrateDrill(d: Drill): Drill {
  const items = d.scene.items.map((it) => {
    const old = it as unknown as { id: string; kind: string; from: Pt; to: Pt }
    if (old.kind !== 'boundary') return it
    const rot = Math.round((Math.atan2(old.to[1] - old.from[1], old.to[0] - old.from[0]) * 180) / Math.PI / 15) * 15
    return { id: old.id, kind: 'toblerone', at: mid(old.from, old.to), rot } as Item
  })
  return { ...d, scene: { ...d.scene, items } }
}
export const migrateDb = (db: Db): Db => ({
  ...db,
  drills: db.drills.map(migrateDrill),
  sessions: db.sessions.map((s) => ({ ...s, entries: s.entries.map((e) => ({ ...e, drill: migrateDrill(e.drill) })) })),
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
// content) are skipped; a record whose id exists with different content is added as a copy «(Import)», and the
// imported collections point at those copies.
export function mergeDb(current: Db, incoming: Db) {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  const added = { drills: 0, collections: 0, sessions: 0 }
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
  const collections = add(
    current.collections,
    incoming.collections.map((c) => ({ ...c, drillIds: c.drillIds.map((id) => drillIds.get(id) ?? id) })),
    'collections',
    (c) => ({ ...c, name: `${c.name} (Import)` }),
  )
  const sessions = add(current.sessions, incoming.sessions, 'sessions', (s) => ({ ...s, title: `${s.title} (Import)` }))
  return { db: { ...current, drills, collections, sessions }, added, skipped }
}

// New training from a template or an earlier training: fresh ids, no date, starts as a plan.
export const fromTemplate = (s: Session): Session => ({ ...duplicateSession(s), title: s.title, date: undefined, template: undefined })

export const totalMinutes = (s: Session) => s.entries.reduce((sum, e) => sum + e.minutes, 0)

export function moveIndex<T>(list: T[], from: number, to: number): T[] {
  const next = [...list]
  next.splice(to, 0, ...next.splice(from, 1))
  return next
}

const has = (texts: string[], needle: string) => !needle || texts.some((t) => t.toLowerCase().includes(needle))
const tagged = (d: Drill, category: string, element: string) =>
  (!category || d.categories.includes(category)) && (!element || d.elements.includes(element))

export function filterDrills(drills: Drill[], q: string, category: string, element: string, place: '' | 'on' | 'off') {
  const needle = q.trim().toLowerCase()
  return drills.filter(
    (d) => tagged(d, category, element) && (!place || d.offIce === (place === 'off')) && has([d.title, d.description, ...d.keyPoints], needle),
  )
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
  need(opt(d.minutes, (m) => isNum(m) && m >= 0), `${w}: ungültige Dauer`)
  need(typeof d.offIce === 'boolean' && typeof d.draft === 'boolean', `${w}: Felder fehlen`)
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
    need(isObj(s) && isStr(s.id) && isStr(s.title) && opt(s.date, isStr) && opt(s.final, (f) => typeof f === 'boolean') && opt(s.notes, isStr) && opt(s.template, (t) => typeof t === 'boolean') && Array.isArray(s.entries), `Training ${i + 1}: Felder fehlen`)
    s.entries.forEach((e, j) => {
      const w = `Training ${i + 1}, Eintrag ${j + 1}`
      need(isObj(e) && isStr(e.id) && isNum(e.minutes) && e.minutes >= 0 && isStr(e.notes), `${w}: Felder fehlen`)
      checkDrill(e.drill, w)
    })
    need(unique(s.entries.map((e: Obj) => e.id)), `Training ${i + 1}: doppelte Eintrags-IDs`)
  })
  need(unique(x.collections.map((c: Obj) => c.id)) && unique(x.sessions.map((s: Obj) => s.id)), 'Doppelte IDs')
  return x as unknown as Db
}
