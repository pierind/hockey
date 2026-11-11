// Imports the IIHF Learn to Play practice manuals (Levels A–D) into a backup file for «Backup importieren → Hinzufügen».
// Private use only: the output goes to private/ (gitignored) and must never be committed, this repo is public.
// Needs poppler on PATH (pdftohtml, pdftoppm; e.g. `brew install poppler`). PDFs are cached in $TMPDIR/iihf-ltp.
// Usage: node scripts/import-iihf.mjs   → private/iihf.json
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { oneCollection } from './one-collection.mjs'

// Linked from https://www.iihf.com/en/statichub/20883/learn-to-play (2026-10); C and D both carry the «6-3» prefix there.
const BASE = 'https://blob.iihf.com/iihf-media/iihfmvc/media/downloads/sport%20files/development-guide/ltp/'
const MANUALS = { A: '6-1_practice_manual_a', B: '6-2_practice_manual_b', C: '6-3_practice_manual_c', D: '6-3_practice_manual_d' }
const UPDATED = '2020-09-29T00:00:00.000Z' // edition date of the 2020 LTP manuals
const CACHE = join(tmpdir(), 'iihf-ltp')
const BOTTOM = 870 // lowest content line on a page, in pdftohtml units (1.5 × pt)
const DPI = 108 // renders pages at 1 px per pdftohtml unit

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" }
const clean = (s) => s.replace(/<[^>]+>/g, '').replace(/&(\w+|#39);/g, (m, e) => ENTITIES[e] ?? m)
  .replace(/ﬁ ?/g, 'fi').replace(/ﬂ ?/g, 'fl').replace(/ﬀ ?/g, 'ff') // ligatures come out with a stray space
const join2 = (a, b, gap) => a + (/\s$/.test(a) || /^\s/.test(b) || gap < 5 ? '' : ' ') + b

function pages(xml) {
  const fonts = Object.fromEntries([...xml.matchAll(/<fontspec id="(\d+)" size="(\d+)" family="([^"]+)" color="([^"]+)"/g)]
    .map(([, id, size, family, color]) => [id, { size: Number(size), bold: family.includes('-Bd'), red: color === '#ef3749', white: color === '#ffffff' }]))
  return xml.split('<page ').slice(1).map((p) => {
    const els = [...p.matchAll(/<text top="(\d+)" left="(\d+)" width="(\d+)" height="(\d+)" font="(\d+)">(.*?)<\/text>/g)]
      .map(([, t, l, w, h, f, s]) => ({ top: +t, left: +l, right: +l + +w, bottom: +t + +h, ...fonts[f], text: clean(s) }))
      .filter((e) => e.text.trim())
    const head = els.filter((e) => e.top < 70).sort((a, b) => a.left - b.left).map((e) => e.text).join(' ').replace(/\s+/g, ' ')
    return { n: Number(p.match(/number="(\d+)"/)[1]), els: els.filter((e) => e.top >= 70), head }
  })
}

// Text pieces on one line that touch each other; player numbers (white digits in circles) become ①②③.
function fragments(els) {
  const frags = []
  for (const e of [...els].sort((a, b) => a.left - b.left)) {
    const n = Number(e.text.trim())
    const t = e.white && n >= 1 && n <= 20 ? String.fromCodePoint(0x245f + n) : e.text
    const f = frags.find((f) => Math.abs(f.top - e.top) <= 4 && e.left >= f.left && e.left - f.right <= 15)
    if (f) Object.assign(f, { text: join2(f.text, t, e.left - f.right), right: e.right, bottom: Math.max(f.bottom, e.bottom), small: f.small && e.size < 12 })
    else frags.push({ top: e.top, left: e.left, right: e.right, bottom: e.bottom, text: t, small: e.size < 12 })
  }
  return frags.filter((f) => !f.small) // lone small labels belong to a diagram
}

// Columns (line starts more than 40 apart) read top to bottom; a dash/dot or a blank line starts a new item.
function paragraphs(frags) {
  const col = new Map()
  let c = -1
  let prev = -Infinity
  for (const l of [...new Set(frags.map((f) => f.left))].sort((a, b) => a - b)) {
    if (l - prev > 40) c++
    col.set(l, c)
    prev = l
  }
  const items = []
  let last
  for (const f of [...frags].sort((a, b) => col.get(a.left) - col.get(b.left) || a.top - b.top)) {
    const t = f.text.replace(/\s+/g, ' ').trim()
    if (last && col.get(last.left) === col.get(f.left) && f.top - last.top < 24 && !/^([–—·•]|NOTE)/.test(t)) {
      items[items.length - 1] = items.at(-1).endsWith('-') ? items.at(-1) + t : `${items.at(-1)} ${t}`
    } else items.push(t)
    last = f
  }
  return items
}

// Bold headings (merging wrapped lines) and the box below each: up to the next heading on its row and below it.
function boxes(els, minTop) {
  const hs = []
  const subs = []
  for (const e of els.filter((e) => e.bold && e.size < 16 && e.top > minTop).sort((a, b) => a.top - b.top || a.left - b.left)) {
    const h = hs.find((h) => (Math.abs(h.last - e.top) <= 3 && e.left >= h.left && e.left - h.right <= 25) || (e.top - h.last > 3 && e.top - h.last <= 20 && Math.abs(e.left - h.left) <= 3))
    // Bold first lines of the text (a gap below the heading) stay body text.
    if (!h && (hs.some((o) => Math.abs(o.left - e.left) <= 3 && e.top - o.last > 20 && e.top - o.last <= 30) || subs.some((o) => Math.abs(o.left - e.left) <= 20 && e.top - o.top > 3 && e.top - o.top <= 20))) {
      subs.push(e)
      continue
    }
    if (!h) hs.push({ top: e.top, last: e.top, left: e.left, right: e.right, bottom: e.bottom, text: e.text, parts: [e] })
    else {
      Object.assign(h, { text: Math.abs(h.last - e.top) <= 3 ? join2(h.text, e.text, e.left - h.right) : `${h.text.trim()} ${e.text}`, right: Math.max(h.right, e.right), last: e.top, bottom: e.bottom })
      h.parts.push(e)
    }
  }
  for (const h of hs) Object.assign(h, { title: h.text.replace(/\s+/g, ' ').trim(), x0: h.left - 5, x1: Math.min(1200, ...hs.filter((o) => Math.abs(o.top - h.top) <= 5 && o.left > h.left).map((o) => o.left - 5)) })
  for (const h of hs) {
    h.time = els.find((e) => e.red && /^\s*\d+\s*'\s*$/.test(e.text) && Math.abs(e.top - h.top) <= 6 && e.left > h.left && e.left < h.x1)
    if (h.time) h.x1 = Math.min(h.x1, h.time.right + 15)
  }
  for (const h of hs) {
    h.y1 = Math.min(BOTTOM, ...hs.filter((o) => o.top > h.last + 5 && o.left < h.x1 && o.x1 > h.x0).map((o) => o.top - 5))
    h.body = els.filter((e) => !h.parts.includes(e) && !(e.red && e.size >= 16) && e.left >= h.x0 && e.left < h.x1 && e.top >= h.top - 3 && e.top < h.y1)
  }
  return hs.filter((h) => h.title)
}

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 })

// The drawing or photo in a drill's box: dark pixels left after masking the text, minus border and separator lines.
function crop(pdf, page, box, gray) {
  const { w, px } = gray
  const x0 = box.x0
  const x1 = box.x1
  const y0 = box.top - 3
  const y1 = box.y1
  if (x1 - x0 < 40 || y1 - y0 < 30) return undefined
  const dark = (x, y) => px[y * w + x] < 200
  const lineRow = new Set()
  for (let y = y0; y < y1; y++) {
    let n = 0
    for (let x = x0; x < x1; x++) n += dark(x, y)
    if (n > 0.8 * (x1 - x0)) lineRow.add(y)
  }
  // Blobs of dark pixels (gaps up to 2 px bridged); thin separators and text leftovers are small next to a drawing or photo.
  const W = x1 - x0
  const seen = new Uint8Array(W * (y1 - y0))
  const blobs = []
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (lineRow.has(y) || seen[(y - y0) * W + x - x0] || !dark(x, y)) continue
    const b = { x0: x, y0: y, x1: x, y1: y, n: 0 }
    const stack = [[x, y]]
    seen[(y - y0) * W + x - x0] = 1
    while (stack.length) {
      const [cx, cy] = stack.pop()
      Object.assign(b, { x0: Math.min(b.x0, cx), y0: Math.min(b.y0, cy), x1: Math.max(b.x1, cx), y1: Math.max(b.y1, cy), n: b.n + 1 })
      for (let ny = Math.max(y0, cy - 2); ny <= Math.min(y1 - 1, cy + 2); ny++) for (let nx = Math.max(x0, cx - 2); nx <= Math.min(x1 - 1, cx + 2); nx++) {
        const i = (ny - y0) * W + nx - x0
        if (!seen[i] && !lineRow.has(ny) && dark(nx, ny)) { seen[i] = 1; stack.push([nx, ny]) }
      }
    }
    blobs.push(b)
  }
  const most = Math.max(0, ...blobs.map((b) => b.n))
  const keep = blobs.filter((b) => b.n >= Math.max(30, 0.05 * most) && b.x1 - b.x0 > 4 && b.y1 - b.y0 > 4)
  const [bx0, by0, bx1, by1] = [Math.min(...keep.map((b) => b.x0)), Math.min(...keep.map((b) => b.y0)), Math.max(...keep.map((b) => b.x1)), Math.max(...keep.map((b) => b.y1))]
  if (most < 300 || bx1 - bx0 < 40 || by1 - by0 < 30) return undefined
  const [cx, cy, cw, ch] = [bx0 - 6, by0 - 6, bx1 - bx0 + 13, by1 - by0 + 13]
  const dpi = Math.min(144, Math.floor((600 * DPI) / cw))
  const s = dpi / DPI
  const out = join(CACHE, 'crop')
  run('pdftoppm', ['-r', dpi, '-f', page, '-l', page, '-x', Math.round(cx * s), '-y', Math.round(cy * s), '-W', Math.round(cw * s), '-H', Math.round(ch * s), '-jpeg', '-jpegopt', 'quality=70', '-singlefile', pdf, out].map(String))
  return `data:image/jpeg;base64,${readFileSync(`${out}.jpg`).toString('base64')}`
}

function grayPage(pdf, page, els) {
  const out = join(CACHE, 'page')
  run('pdftoppm', ['-r', DPI, '-gray', '-f', page, '-l', page, '-singlefile', pdf, out].map(String))
  const buf = readFileSync(`${out}.pgm`)
  const [header, w, h] = buf.toString('latin1', 0, 40).match(/^P5\s+(\d+)\s+(\d+)\s+\d+\s/)
  const px = new Uint8Array(buf.subarray(header.length))
  for (const e of els) {
    const pad = e.white ? 7 : 1 // white digits sit in a drawn circle
    for (let y = e.top - pad; y <= e.bottom + pad; y++) px.fill(255, y * w + e.left - pad, y * w + e.right + pad + 1)
  }
  return { w: Number(w), h: Number(h), px }
}

// Only clear matches, most specific first; the first is the primary category.
const CATS = [
  ['EF06', /shot|shoot|scor/i], ['EF05', /pass|receiv/i], ['EF04', /puck|stickhandl/i], ['EF08', /check|battle|angling/i],
  ['EF03', /skat|stride|crossover|stop|turn|pivot|glid|push|c-cut|start|edge|scoot/i], ['EF01', /balance|agility|stance|getting up|jump/i],
]
const categoriesOf = (title) => /^(Free Skate|Warm-up|Fun Time|Game)/.test(title) ? [] : CATS.filter(([, re]) => re.test(title)).map(([id]) => id)
const flat = (items) => items.map((i) => i.replace(/^[–—]\s*/, '')).reduce((acc, i) => {
  if (/^[·•]/.test(i) && acc.length) acc[acc.length - 1] += `${acc.at(-1).endsWith(':') ? ' ' : '; '}${i.replace(/^[·•]\s*/, '')}`
  else acc.push(i)
  return acc
}, [])
const base = (title) => title.replace(/\s*\((introduce|review|refine)\)\s*$/i, '').toLowerCase()

mkdirSync(CACHE, { recursive: true })
const drills = []
const collections = []
for (const [level, file] of Object.entries(MANUALS)) {
  const url = `${BASE}iihf_ltp_manual_${file}.pdf`
  const pdf = join(CACHE, `${file}.pdf`)
  if (!existsSync(pdf)) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
    writeFileSync(pdf, Buffer.from(await res.arrayBuffer()))
    await new Promise((r) => setTimeout(r, 1000)) // be polite to blob.iihf.com
  }
  run('pdftohtml', ['-xml', '-i', '-q', pdf, join(CACHE, level)])
  const practices = new Map() // number → { objectives, sections, plans: [{ page, … }] }
  const practice = (n) => practices.get(n) ?? practices.set(n, { objectives: [], sections: [], plans: [] }).get(n)
  for (const page of pages(readFileSync(join(CACHE, `${level}.xml`), 'utf8'))) {
    const m = page.head.match(/PRACTICE (PLAN )?([A-D])-(\d+)(?: TO [A-D]-(\d+))?/)
    if (!m || m[2] !== level) continue
    if (m[1]) {
      practice(Number(m[3])).plans.push(page)
      continue
    }
    // «Practice X-n» pages: Specific Objectives in the header box, then Key Instructional Points sections.
    const obj = page.els.find((e) => /Specific Objectives/.test(e.text))
    let minTop = 70
    if (obj) {
      const next = Math.min(BOTTOM, ...page.els.filter((e) => e.bold && e.top > obj.top + 20).map((e) => e.top))
      const els = page.els.filter((e) => e.left > obj.right + 20 && e.top >= obj.top - 5 && e.top < next)
      minTop = Math.max(obj.bottom, ...els.map((e) => e.bottom))
      for (let n = Number(m[3]); n <= Number(m[4] ?? m[3]); n++) practice(n).objectives.push(...paragraphs(fragments(els)))
    }
    for (const b of boxes(page.els, minTop)) {
      const items = flat(paragraphs(fragments(b.body)))
      if (items.length) practice(Number(m[3])).sections.push({ name: b.title.replace(/\s*[–-]\s*$/, ''), items })
    }
  }
  for (const [n, p] of [...practices].sort(([a], [b]) => a - b)) {
    if (!p.plans.length) continue
    const code = `${level}-${String(n).padStart(2, '0')}`
    const ids = []
    let material
    for (const page of p.plans) {
      const tools = page.els.find((e) => /Teaching Tools needed/.test(e.text))
      if (tools) material = flat(paragraphs(fragments(page.els.filter((e) => e.left > tools.right && e.left < 1090 && e.top < tools.top + 120 && !e.bold && !e.red)))).join(', ')
      const top = Math.max(70, ...page.els.filter((e) => e.bold && e.size >= 16).map((e) => e.bottom))
      const gray = grayPage(pdf, page.n, page.els)
      for (const b of boxes(page.els, top)) {
        if (/^Summary$/.test(b.title)) continue
        const frags = fragments(b.body.filter((e) => !e.red || e.size < 16))
        const body = paragraphs(frags).filter((t) => !/^(Positives|Areas for Improvement):?$/.test(t))
        if (!body.length) continue // empty template rows (A-16 to A-20 leave some to the coach)
        const src = `${url}#page=${page.n}`
        const own = p.sections.filter((s) => base(b.title).includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(base(b.title)))
        const keyPoints = own.length ? own.flatMap((s) => s.items) : p.sections.flatMap((s) => s.items.map((i) => `${s.name}: ${i}`))
        const categories = categoriesOf(b.title)
        const image = crop(pdf, page.n, b, gray)
        const id = `iihf-${level.toLowerCase()}${String(n).padStart(2, '0')}-${ids.length + 1}`
        ids.push(id)
        drills.push({
          id, title: b.title, description: [body.join('\n'), p.objectives.length && `Practice ${code} – Specific Objectives:\n${p.objectives.join('\n')}`, `Quelle: IIHF Learn to Play (${src})`].filter(Boolean).join('\n\n'),
          keyPoints, categories, ...(categories[0] && { primary: categories[0] }), elements: [],
          ...(b.time && { minutes: Number(b.time.text.replace(/\D/g, '')) }), ...(material && { material }),
          offIce: false, draft: true, scene: { rink: 'full', items: [] }, source: src, ...(image && { image }), updatedAt: UPDATED,
        })
      }
    }
    collections.push({ id: `iihf-c-${level.toLowerCase()}${String(n).padStart(2, '0')}`, name: `IIHF LTP ${code}`, drillIds: ids })
  }
}
const bad = [...drills.filter((d) => !d.title || !d.description.split('\n\n')[0]).map((d) => d.id), ...collections.filter((c) => c.drillIds.length < 2).map((c) => c.name)]
if (bad.length || collections.length !== 80) throw new Error(`Unvollständig (${collections.length}/80 Trainings): ${bad.join(', ')}`)
mkdirSync(new URL('../private/', import.meta.url), { recursive: true })
writeFileSync(new URL('../private/iihf.json', import.meta.url), JSON.stringify({ version: 1, drills, collections: oneCollection(drills, collections, 'iihf-c-all', 'IIHF Learn to Play'), sessions: [] }, null, 2))
console.log(`${drills.length} Übungen (${drills.filter((d) => d.image).length} mit Bild) → private/iihf.json`)
