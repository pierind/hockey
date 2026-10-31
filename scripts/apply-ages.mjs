// Fills the Altersklassen (U10 … U18+) of imported drills in backup files from the age hints their sources carry:
// «U9-U12», «U13 and Up», «12U», «10-and-Under», TKH, IIHF Learn to Play, mobilesport «Kinder»/«Jugendliche», goalie levels.
// Drills that already have ages (set by hand or an earlier run) and own drills (no source) are left alone.
// Usage: node scripts/apply-ages.mjs [private/x.json | eishockey-backup.json ...]   (default: all private/*.json)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

const CLASSES = ['U10', 'U12', 'U14', 'U16', 'U18+']
// «Under n» falls into the Swiss class: U7–U10 → U10, U11–U12 → U12, U13–U14 → U14, U15–U16 → U16, older → U18+.
const cls = (n) => Math.min(Math.max(Math.ceil((n - 10) / 2), 0), 4)
// shortcut: drills without any hint are guessed from their text (systems play → U14+, else U12+); fix single drills by hand in the editor.
const SYSTEMS = /\b(power ?play|penalty kill|breakouts?|forecheck\w*|regroups?|neutral zone|d-?zone|systems?|gap control|cycl(e|ing)|1-2-2|2-1-2|trap)\b/i

export function agesOf(d) {
  const t = `${d.title}\n${d.description}`
  const out = new Set()
  const span = (a, b) => { for (let i = cls(a); i <= cls(b); i++) out.add(i) }
  const age = (n) => n >= 5 && n <= 21
  for (const [, a, b, up] of t.matchAll(/\bU ?(\d{1,2})\b(?:\s*-\s*U ?(\d{1,2})\b)?(\s+and\s+up\b)?/gi))
    if (age(+a)) span(+a, up ? 18 : b && age(+b) ? +b : +a)
  for (const [, n] of t.matchAll(/\b(\d{1,2}) ?U\b/g)) if (age(+n)) span(+n, +n)
  for (const [, list] of t.matchAll(/\b((?:\d{1,2}-,\s*)*\d{1,2})-and-Under\b/gi)) for (const n of list.match(/\d+/g)) span(+n, +n)
  if (/\bTKH\b|Learn to Play|\bCategory: (Novice|Initiation)\b/i.test(t) || d.id.startsWith('iihf-')) out.add(0)
  if (/\bJunior-Senior\b/.test(t)) out.add(4)
  if (/^Kinder · /m.test(t)) span(10, 12)
  if (/^Jugendliche · /m.test(t)) span(13, 16)
  const level = t.match(/· [^\n]*\b(Beginner|Intermediate|Advanced)\b/)?.[1]
  if (level) span(...{ Beginner: [10, 12], Intermediate: [11, 14], Advanced: [13, 18] }[level])
  if (!out.size) span(SYSTEMS.test(t) ? 13 : 11, 18)
  return [...out].sort().map((i) => CLASSES[i])
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = (title, description = '', id = 'x') => agesOf({ id, title, description }).join(' ')
  console.assert(a('x', 'Alter: U7 - U9, U11 - U13') === 'U10 U12 U14', a('x', 'Alter: U7 - U9, U11 - U13'))
  console.assert(a('x', 'Alter: U13 and Up') === 'U14 U16 U18+')
  console.assert(a('x', 'Gruppen: Hockey drills; TKH; U9-U12') === 'U10 U12')
  console.assert(a('x', 'Small Area Competitive Games · 14-, 16-, 18-and-Under') === 'U14 U16 U18+')
  console.assert(a('x', '12U ADM practice plan') === 'U12')
  console.assert(a('x', 'Kinder · Phase F2') === 'U10 U12')
  console.assert(a('Breakout drill') === 'U14 U16 U18+' && a('Passing') === 'U12 U14 U16 U18+')
  console.assert(a('Free Skate', '', 'iihf-a01-1') === 'U10')

  const root = new URL('../', import.meta.url)
  const files = process.argv.slice(2).length ? process.argv.slice(2)
    : readdirSync(new URL('private/', root)).filter((f) => f.endsWith('.json')).map((f) => new URL(`private/${f}`, root).pathname)
  for (const file of files) {
    const db = JSON.parse(readFileSync(file, 'utf8'))
    const count = {}
    for (const d of [...db.drills, ...db.sessions.flatMap((s) => s.entries.map((e) => e.drill))]) {
      if (d.ages || !d.source) continue
      d.ages = agesOf(d)
      count[d.ages.join(' ')] = (count[d.ages.join(' ')] ?? 0) + 1
    }
    writeFileSync(file, JSON.stringify(db, null, 2))
    console.log(file, count)
  }
}
