// Applies private/meta/translations.json (English title, description and key points by drill id, for drills imported
// in Swedish or French) to imported backup files in private/, or to an exported app backup (also its training snapshots).
// Usage: node scripts/apply-translations.mjs [private/x.json | eishockey-backup.json ...]   (default: all private/*.json)
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const translations = JSON.parse(readFileSync(new URL('private/meta/translations.json', root), 'utf8'))

const files = process.argv.slice(2).length ? process.argv.slice(2)
  : readdirSync(new URL('private/', root)).filter((f) => f.endsWith('.json')).map((f) => new URL(`private/${f}`, root).pathname)
for (const file of files) {
  if (!existsSync(file)) { console.error(`${file}: not found`); process.exitCode = 1; continue }
  const db = JSON.parse(readFileSync(file, 'utf8'))
  let n = 0
  const apply = (d) => translations[d.id] && (Object.assign(d, translations[d.id]), n++)
  db.drills.forEach(apply)
  db.sessions.forEach((s) => s.entries.forEach((e) => apply(e.drill)))
  writeFileSync(file, JSON.stringify(db, null, 2))
  console.log(`${file}: ${n} drills translated`)
}
