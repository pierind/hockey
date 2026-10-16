// Fetches the public Hockey Canada Drill Hub drills and the U7/U9 practice plan PDFs into a backup file for «Backup importieren → Hinzufügen».
// Private use only: the output goes to private/ (gitignored) and must never be committed, this repo is public.
// Needs poppler (pdftotext, pdftoppm) for the PDF plans. Usage: node scripts/import-hockeycanada.mjs   → private/hockeycanada.json
// HC_CACHE=<dir> keeps the downloads between runs, so tweaking the parser does not hit the site again.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { oneCollection } from './one-collection.mjs'

const SITE = 'https://video.hockeycanada.ca'
const HUB = `${SITE}/en-ca/hockey-programs/drill-hub`
const DATE = '2026-10-15T00:00:00.000Z' // the sources carry no edit dates; a constant keeps re-imports identical
const SIHF = { Skating: 'EF03', 'Puck Control': 'EF05', Passing: 'EF06', Shooting: 'EF07', Scoring: 'EF07', 'Checking Drill': 'EF09' }
// PDF drills have no category, only an uppercase title: map the unambiguous words.
const TITLE_SIHF = [[/SHOOT|SCORING/, 'EF07'], [/PASS/, 'EF06'], [/STICKHANDL|PUCK CONTROL|PUCK CARRY|OPEN ICE CARRY/, 'EF05'], [/CROSSOVER|C-CUT|T-PUSH|STRIDE|PIVOT|STOPPING|EDGE|GLID|SKATING/, 'EF03']]

let last = 0
async function get(url) {
  const file = process.env.HC_CACHE && join(process.env.HC_CACHE, url.replace(/[^\w.-]+/g, '_').slice(-200))
  if (file && existsSync(file)) return readFileSync(file)
  await new Promise((r) => setTimeout(r, Math.max(0, last + 1000 - Date.now()))) // at most 1 request per second
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; private drill import)' } })
  last = Date.now()
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (file) mkdirSync(process.env.HC_CACHE, { recursive: true }), writeFileSync(file, buf)
  return buf
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', deg: '°' }
const text = (html) => html
  .replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')
  .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m))
  .replace(/[-\u0000-\u0009\u000B-\u001F]/g, '').replace(/[ \t ]+/g, ' ').trim()
// Block markup → one line per paragraph or bullet («- »).
const lines = (html) => html.replace(/\s+/g, ' ').replace(/<li[^>]*>/gi, '\n- ').replace(/<\/?(p|ul|ol|li|h\d|div|br)\b[^>]*>/gi, '\n')
  .split('\n').map(text).filter((l) => l && l !== '-')
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const slug = (s) => norm(s).replace(/ /g, '-').slice(0, 60)
const drill = (id, title, d) => ({
  id, title, description: d.description, keyPoints: d.keyPoints ?? [], categories: d.categories, ...(d.categories[0] && { primary: d.categories[0] }),
  elements: [], ...(d.minutes && { minutes: d.minutes }), offIce: false, draft: true, scene: { rink: 'full', items: [] },
  source: d.source, ...(d.image && { image: d.image }), updatedAt: DATE,
})

// ── Drill Hub: the listing endpoint returns every drill with its full text, so one request per filter is enough.
const list = async (filter = '') => (await get(`${SITE}/drills/renderdrills?li=drillNotLogin&page=1&display=2000&${filter}&searchterm=&sort=&planid=&pathname=/en-ca/hockey-programs/drill-hub`)).toString()
const ids = (html) => [...html.matchAll(/class="drill col-sm-12" id="drill_\d+" data-drill-id="(\d+)"/g)].map((m) => m[1])
const hubHtml = (await get(HUB)).toString()
const filters = (name) => [...hubHtml.matchAll(new RegExp(`name="${name}"[^>]*value="(\\d+)"[\\s\\S]*?<label[^>]*>([^<]+)<`, 'g'))].map(([, v, label]) => ({ v, label: text(label) }))

const all = await list('ageids=&categoryids=')
const total = Number((await get(`${SITE}/drills/gettotaldrills?li=drillNotLogin&page=1&display=12&ageids=&categoryids=&searchterm=&sort=&planid=&pathname=/en-ca/hockey-programs/drill-hub`)).toString().replace(/\D/g, ''))
const hubCats = new Map() // drill id → Hockey Canada categories
const ages = new Map()
const collections = []
for (const c of filters('category')) {
  const members = ids(await list(`ageids=&categoryids=${c.v}`))
  members.forEach((id) => hubCats.set(id, [...(hubCats.get(id) ?? []), c.label]))
  collections.push({ id: `hc-c-${slug(c.label)}`, name: `Hockey Canada: ${c.label}`, drillIds: members.map((id) => `hc-${id}`) })
}
for (const a of filters('ageGroup')) ids(await list(`ageids=${a.v}&categoryids=`)).forEach((id) => ages.set(id, [...(ages.get(id) ?? []), a.label]))

const drills = all.split('<div class="drill col-sm-12"').slice(1).map((chunk) => {
  const id = chunk.match(/data-drill-id="(\d+)"/)[1]
  const body = lines(chunk.match(/class="drillDescription">([\s\S]*?)<div class="divBtnDrillExpand"/)?.[1] ?? '')
  const KEY = /^key (teaching |execution )?points?\b:?\s*/i
  const k = body.findIndex((l) => KEY.test(l))
  let description = body
  let keyPoints = []
  if (k >= 0) {
    const rest = body.slice(k + 1)
    const end = rest.findIndex((l) => l.endsWith(':')) // a following heading («Drill:», «Progression:») belongs to the description again
    keyPoints = [body[k].replace(KEY, ''), ...rest.slice(0, end < 0 ? undefined : end)].map((l) => l.replace(/^- /, '')).filter(Boolean)
    description = [...body.slice(0, k), ...(end < 0 ? [] : rest.slice(end))]
  }
  const videos = [...new Set([...chunk.matchAll(/href="(\/en-ca\/videos\?title=[^"]+)" name="embedvideo"/g)].map((m) => SITE + m[1]))]
  const image = chunk.match(/showImageInModal\('(https:\/\/[^']+)'\)/)?.[1]
  const cats = hubCats.get(id) ?? []
  return drill(`hc-${id}`, text(chunk.match(/class="drillTitle">([\s\S]*?)<\/div>/)[1]), {
    description: [description.join('\n'), cats.length && `Kategorie: ${cats.join(', ')}`, ages.has(id) && `Alter: ${ages.get(id).join(', ')}`,
      ...videos.map((v) => `Video: ${v}`), `Quelle: Hockey Canada (${HUB})`].filter(Boolean).join('\n\n'),
    keyPoints, categories: [...new Set(cats.map((c) => SIHF[c]).filter(Boolean))], source: HUB, image,
  })
})
if (drills.length !== total) throw new Error(`Drill Hub: ${drills.length} von ${total} Übungen gelesen`)

// Practice Plans 01–06 only list Drill Hub titles: match them (dashes and word order vary) and keep the PDF link.
const byTitle = new Map(drills.flatMap((d) => [[norm(d.title), d.id], [norm(d.title).split(' ').sort().join(' '), d.id]]))
const plansHtml = (await get(`${HUB}/practice-plans`)).toString()
for (const [, pdf, name, ul] of plansHtml.matchAll(/<h3><a href="(https:[^"]+\.pdf)">([^<]+)<\/a><\/h3>\s*<ul>([\s\S]*?)(?=<h3>|<\/div>)/g)) {
  const titles = [...ul.matchAll(/<li>([^<]+)<\/li>/g)].map((m) => text(m[1]))
  const found = titles.map((t) => byTitle.get(norm(t)) ?? byTitle.get(norm(t).split(' ').sort().join(' ')))
  titles.filter((_, i) => !found[i]).forEach((t) => console.warn(`${name}: «${t}» nicht im Drill Hub gefunden`))
  collections.push({ id: `hc-c-${slug(name)}`, name: `Hockey Canada: ${name}`, description: pdf, drillIds: [...new Set(found.filter(Boolean))] })
}

// ── U7 / U9 practice plans (PDF, 32 lessons each). Page 1: sections «10 MIN WARM-UP» etc., drill text on the left, one rink diagram per section on the right.
const tmp = mkdtempSync(join(tmpdir(), 'hc-'))
const run = (cmd, args) => execFileSync(cmd, args, { maxBuffer: 1 << 28 })
const TEXT_X = 352 // drill text ends left of this, diagrams start right of it (pt)

// Section diagram: trim the white margin of the right column, then render it at most 600 px wide as grayscale JPEG.
function diagram(file, pageW, top, bottom) {
  const box = ['-x', TEXT_X, '-y', Math.round(top), '-W', Math.round(pageW - TEXT_X), '-H', Math.round(bottom - top)].map(String)
  const pgm = run('pdftoppm', ['-f', '1', '-l', '1', '-r', '72', '-gray', ...box, file])
  const [head, w, h] = pgm.subarray(0, 40).toString('latin1').match(/^P5\s+(\d+)\s+(\d+)\s+255\s/).map((v, i) => (i ? Number(v) : v))
  let [x0, y0, x1, y1] = [w, h, -1, -1]
  const dark = (x, y) => pgm[head.length + y * w + x] < 200
  for (let y = 0; y < h; y++) {
    const row = Array.from({ length: w }, (_, x) => dark(x, y))
    if (row.filter(Boolean).length > w * 0.8) continue // the section bar's rule, not part of the diagram
    row.forEach((d, x) => d && ((x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y))))
  }
  if (x1 - x0 < 50 || y1 - y0 < 30) return undefined
  const [px, py, pw, ph] = [TEXT_X + x0 - 3, top + y0 - 3, x1 - x0 + 6, y1 - y0 + 6]
  const r = Math.min(200, (72 * 600) / pw)
  const jpg = run('pdftoppm', ['-f', '1', '-l', '1', '-r', r.toFixed(2), '-gray', '-jpeg', '-jpegopt', 'quality=55',
    ...['-x', px, '-y', py, '-W', pw, '-H', ph].map((v) => (typeof v === 'number' ? String(Math.floor((v * r) / 72)) : v)), file])
  return `data:image/jpeg;base64,${jpg.toString('base64')}`
}

function planDrills(file, url, group, lesson) {
  const bbox = run('pdftotext', ['-f', '1', '-l', '1', '-bbox', file, '-']).toString()
  const pageW = Number(bbox.match(/<page width="([\d.]+)"/)[1])
  const words = [...bbox.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="[\d.]+" yMax="([\d.]+)">([^<]*)<\/word>/g)].map(([, x, y, y2, t]) => ({ x: +x, y: +y, y2: +y2, t }))
  const heads = words.filter((w) => w.t === 'MIN' && w.x < 120).sort((a, b) => a.y - b.y)
  const footer = words.find((w) => w.t === 'HOCKEY' && w.y > 600)?.y ?? 760
  const full = run('pdftotext', ['-f', '1', '-l', '1', file, '-']).toString()
  const objectives = text(full.match(/Session Objectives:([^\n]+)/)?.[1] ?? '')
  const body = run('pdftotext', ['-f', '1', '-l', '1', '-x', '0', '-y', '0', '-W', String(TEXT_X), '-H', String(Math.round(footer - 2)), file, '-']).toString()
  const sections = []
  let cur
  for (const raw of body.split('\n').map(text).filter(Boolean)) {
    const min = raw.match(/^(\d+) MIN$/)
    if (min) { cur = undefined; sections.push({ minutes: Number(min[1]), name: '', drills: [] }); continue }
    const s = sections.at(-1)
    if (!s) continue
    if (!s.name) { s.name = raw.replace(/\s*-\s*/g, '-'); continue }
    if (/^\([\d./ ]+\)$/.test(raw) && cur && !cur.lines.length) { cur.title += ` ${raw}`; continue }
    if (!/[a-z]/.test(raw) && /[A-Z]{2}/.test(raw) && raw.length > 2) { cur = { title: raw.replace(/^\d+\.\s*/, ''), lines: [] }; s.drills.push(cur); continue }
    if (cur) cur.lines.push(raw)
  }
  return sections.flatMap((s, i) => {
    const top = heads[i] ? heads[i].y - 8 : 0 // the diagram starts level with the section bar
    const end = heads[i + 1] ? heads[i + 1].y - 4 : footer - 4
    // U9: «KEY EXECUTION POINTS» box under the diagram, bullets in the right column.
    const key = words.find((w) => w.t === 'KEY' && w.x > TEXT_X && w.y > top && w.y < end)
    const bottom = key ? key.y - 3 : end
    const keyPoints = []
    if (key) {
      const right = words.filter((w) => w.x > TEXT_X && w.y > key.y2 && w.y < end)
      for (const y of [...new Set(right.map((w) => Math.round(w.y)))]) {
        const line = text(right.filter((w) => Math.round(w.y) === y).map((w) => w.t).join(' ').replace('KEY EXECUTION POINTS', '')) // a second box of the section above can overlap
        if (!line) continue
        if (line.startsWith('•') || !keyPoints.length) keyPoints.push(line.replace(/^•\s*/, ''))
        else keyPoints[keyPoints.length - 1] += ` ${line}`
      }
    }
    let image
    return s.drills.map((d) => ({
      title: d.title, text: d.lines.join(' ').replace(/(\w)- (\w)/g, '$1-$2'), keyPoints: keyPoints.filter(Boolean), minutes: Math.round(s.minutes / s.drills.length),
      where: `${group} Practice Plan ${lesson} · ${s.name} (${s.minutes} min)`, objectives,
      image: () => (image ??= heads[i] ? diagram(file, pageW, top, bottom) : undefined),
    }))
  })
}

for (const group of ['U7', 'U9']) {
  const page = (await get(`${HUB}/under-${group.slice(1)}`)).toString()
  const pdfs = [...new Set([...page.matchAll(/href="(https:\/\/cdn\.hockeycanada\.ca\/[^"]+\/u\d-practice-plan-(\d+)-e\.pdf)"/g)].map((m) => m[1]))]
  const byKey = new Map() // same title + text in several lessons → one drill
  for (const url of pdfs) {
    const lesson = url.match(/-(\d+)-e\.pdf$/)[1]
    const file = join(tmp, `${group}-${lesson}.pdf`)
    writeFileSync(file, await get(url))
    const found = planDrills(file, url, group, lesson)
    if (!found.length) throw new Error(`${url}: keine Übungen gefunden`)
    const col = { id: `hc-c-${group.toLowerCase()}-${lesson}`, name: `Hockey Canada: ${group} Practice Plan ${lesson}`, description: `${found[0].objectives}\n${url}`.trim(), drillIds: [] }
    for (const p of found) {
      const key = `${p.title}\n${p.text}`
      if (!byKey.has(key)) {
        let id = `hc-${group.toLowerCase()}-${slug(p.title)}`
        for (let n = 2; drills.some((d) => d.id === id); n++) id = `hc-${group.toLowerCase()}-${slug(p.title)}-${n}`
        byKey.set(key, id)
        drills.push(drill(id, p.title, {
          description: [p.text, p.where, `Quelle: Hockey Canada (${url})`].filter(Boolean).join('\n\n'), keyPoints: p.keyPoints, minutes: p.minutes,
          categories: [...new Set(TITLE_SIHF.filter(([re]) => re.test(p.title)).map(([, c]) => c))], source: url, image: p.image(),
        }))
      }
      if (!col.drillIds.includes(byKey.get(key))) col.drillIds.push(byKey.get(key))
    }
    collections.push(col)
  }
}
rmSync(tmp, { recursive: true, force: true })

const bad = drills.filter((d) => !d.title || /^(Kategorie|Alter|Video|Quelle|U\d Practice)/.test(d.description))
if (bad.length) throw new Error(`Unvollständig: ${bad.map((d) => d.id).join(', ')}`)
mkdirSync(new URL('../private/', import.meta.url), { recursive: true })
const out = JSON.stringify({ version: 1, drills, collections: oneCollection(drills, collections, 'hc-c-all', 'Hockey Canada'), sessions: [] }, null, 2)
writeFileSync(new URL('../private/hockeycanada.json', import.meta.url), out)
console.log(`${drills.length} Übungen, ${(out.length / 1e6).toFixed(1)} MB → private/hockeycanada.json`)
