// Applies private/meta/classification.json (Erscheinungsformen and Schlüsselelemente per drill) to imported backup files in private/.
// Usage: node scripts/apply-classification.mjs [private/x.json ...]   (default: all private/*.json)
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const classes = JSON.parse(readFileSync(new URL('private/meta/classification.json', root), 'utf8'))
// Element id → its Erscheinungsform, from the '### EFxx' sections of the reference doc (same rule as src/sihf.ts).
const elementCat = {}
let ef = ''
for (const line of readFileSync(new URL('docs/reference/sihf-u12-development-plan.md', root), 'utf8').split('\n')) {
  if (line.startsWith('## ')) ef = ''
  ef = line.match(/^### (EF\d\d) — /)?.[1] ?? ef
  const id = line.match(/^\| ([A-Z]\d\d) \|/)?.[1]
  if (ef && id) elementCat[id] = ef
}

const files = process.argv.slice(2).length ? process.argv.slice(2)
  : readdirSync(new URL('private/', root)).filter((f) => f.endsWith('.json')).map((f) => new URL(`private/${f}`, root).pathname)
for (const file of files) {
  if (!existsSync(file)) { console.error(`${file}: not found`); process.exitCode = 1; continue }
  const db = JSON.parse(readFileSync(file, 'utf8'))
  let n = 0
  for (const d of db.drills) {
    const c = classes[d.id]
    if (!c) continue
    d.categories = c.categories
    if (c.primary) d.primary = c.primary
    else delete d.primary
    d.elements = (c.elements ?? d.elements).filter((e) => c.categories.includes(elementCat[e]))
    n++
  }
  writeFileSync(file, JSON.stringify(db, null, 2))
  console.log(`${file}: ${n}/${db.drills.length} drills classified`)
}
