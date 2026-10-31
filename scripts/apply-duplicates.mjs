// Removes the duplicate drills listed in private/meta/duplicates.json ({ deleted id: kept id }) from imported backup files
// in private/ or an exported app backup. Collections then point at the kept drill; trainings keep their snapshots.
// mobilesport drills (ms-) are never removed, nor drills with a drawn diagram (imported ones have none, so that is the coach's work).
// Usage: node scripts/apply-duplicates.mjs [private/x.json | eishockey-backup.json ...]   (default: all private/*.json)
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const dupes = JSON.parse(readFileSync(new URL('private/meta/duplicates.json', root), 'utf8'))

const files = process.argv.slice(2).length ? process.argv.slice(2)
  : readdirSync(new URL('private/', root)).filter((f) => f.endsWith('.json')).map((f) => new URL(`private/${f}`, root).pathname)
for (const file of files) {
  if (!existsSync(file)) { console.error(`${file}: not found`); process.exitCode = 1; continue }
  const db = JSON.parse(readFileSync(file, 'utf8'))
  const gone = new Set(db.drills.filter((d) => dupes[d.id] && !d.id.startsWith('ms-') && !d.scene.items.length).map((d) => d.id))
  const ids = new Set(db.drills.map((d) => d.id))
  db.drills = db.drills.filter((d) => !gone.has(d.id))
  for (const c of db.collections)
    c.drillIds = [...new Set(c.drillIds.map((id) => (gone.has(id) && ids.has(dupes[id]) ? dupes[id] : id)).filter((id) => !gone.has(id)))]
  writeFileSync(file, JSON.stringify(db, null, 2))
  console.log(`${file}: ${gone.size} duplicate drills removed`)
}
