// Fetches the publicly available USA Hockey drills into a backup file for «Backup importieren → Hinzufügen».
// Private use only: the output goes to private/ (gitignored) and must never be committed, this repo is public.
// Sources: ADM Drill of the Month (admkids.com), camp practice plans (teamusa.usahockey.com), the practice plan PDFs
// (usahockey.com/practiceplans and /practiceplannerguides), the small-area games manuals, and the goalie season plans and
// goalie drill library (usahockeygoaltending.com). Mobile Coach needs a login and is skipped.
// Diagrams that exist only inside PDFs are cut out of the rendered page and embedded as JPEG.
// Needs poppler (pdftotext, pdftoppm, pdfimages) and macOS textutil (.doc files).
// Usage: node scripts/import-usahockey.mjs   → private/usahockey.json (PDFs, ~300 MB, are cached in $TMPDIR/usah-cache)
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CACHE = join(tmpdir(), 'usah-cache')
const TMP = mkdtempSync(join(tmpdir(), 'usah-'))
mkdirSync(CACHE, { recursive: true })
const sh = (cmd, args, encoding = 'utf8') => execFileSync(cmd, args.map(String), { encoding, maxBuffer: 1 << 28 })
const sha = (s) => createHash('sha1').update(s).digest('hex')

// ---------- network: at most one request per second, documents cached ----------
let last = 0
async function get(url, tries = 3) {
  await new Promise((r) => setTimeout(r, Math.max(0, last + 1000 - Date.now())))
  last = Date.now()
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (private drill import)' } })
  if (res.status >= 500 && tries > 1) { // the SportsEngine servers answer 504 now and then
    await new Promise((r) => setTimeout(r, 5000))
    return get(url, tries - 1)
  }
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res
}
const page = async (url) => (await get(url)).text()
// The file time is the server's Last-Modified, used as the drill date so re-imports are identical.
async function download(url) {
  const path = join(CACHE, sha(url).slice(0, 12) + url.match(/\.\w+$/)[0])
  if (!existsSync(path)) {
    const res = await get(url)
    writeFileSync(path, Buffer.from(await res.arrayBuffer()))
    const t = Date.parse(res.headers.get('last-modified') ?? '') / 1000
    if (t) utimesSync(path, t, t)
  }
  return { url, path, date: statSync(path).mtime.toISOString() }
}

// ---------- text ----------
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', frac12: '½', frac14: '¼', frac34: '¾', deg: '°', bull: '•', middot: '·', eacute: 'é', times: '×', rarr: '→' }
const LIGATURES = { 'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl' }
const clean = (s) => s
  .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m))
  .replace(/[ﬀ-ﬄ]/g, (c) => LIGATURES[c]).replace(/[ \t ​]+/g, ' ').replace(/ *\n */g, '\n').trim()
const text = (html) => clean(html.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, ''))
const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
const cap = (s) => s[0] + s.slice(1).toLowerCase()
const usDate = (s) => { const [m, d, y] = s.match(/(\d\d)\/(\d\d)\/(\d\d(?:\d\d)?)/).slice(1); return `${y.length === 2 ? '20' + y : y}-${m}-${d}T12:00:00.000Z` }

// ---------- categories (SIHF Erscheinungsformen), only when the title clearly names the theme ----------
const RULES = [
  ['EF08', (t) => /power ?play|penalty kill|odd[- ]man/i.test(t) || [...t.matchAll(/\b(\d)\s*(?:v|vs\.?|-on-|on)\s*(\d)\b/gi)].some(([, a, b]) => +a > +b && +b > 0)],
  ['EF09', (t) => /\b1\s*(?:v|vs\.?|-on-)\s*1\b|battle|angl(e|ing)\b|contact|checking|puck protection|\bgap\b|forecheck|backcheck|bumper/i.test(t)],
  ['EF07', (t) => /shoot|shot\b|scor|rebound|\btip\b|tip-in|wrap-around|net[- ]front|deflect|breakaway|sniper/i.test(t)],
  ['EF06', (t) => /pass|possession|keep-?away|support|regroup|breakout|give[- ]and[- ]go|weave|exchange|quarterback|outlet/i.test(t)],
  ['EF05', (t) => /stickhandl|stick-handl|puck control|puck[- ]handling|underhandl|stick work|\bdekes?\b|dangle|fakes?\b|with (?:a )?(?:blue )?pucks?\b/i.test(t)],
  ['EF04', (t) => /crossover|pivot|\bedges?\b|tight turn|\bstops?\b|stopping|c-cut|figure ?8/i.test(t)],
  ['EF01', (t) => /balance|getting up|\babc[’']?s?\b|coordination|stance|marching|balloon|bending/i.test(t)],
  ['EF03', (t) => /skat|sprint|speed|agility|\btag\b|race|relay/i.test(t)],
]
const classify = (title) => RULES.filter(([, ok]) => ok(title)).map(([id]) => id)

// ---------- drills and collections ----------
const drills = new Map() // identical drills (same title, text and key points) from several sources are stored once
const collections = []
const counts = {}
function add(src, d) {
  const key = [d.title, ...d.paras, ...(d.keyPoints ?? [])].join('\n').toLowerCase().replace(/\W+/g, ' ')
  const id = `usah-${slug(d.title)}-${sha(key).slice(0, 6)}`
  counts[src] = (counts[src] ?? 0) + 1
  if (drills.has(id)) return id
  const categories = d.goalie ? [] : classify(d.title)
  const description = [...d.paras, d.context, `Quelle: USA Hockey (${d.source})`].filter(Boolean).join('\n\n')
  drills.set(id, {
    id, title: d.title, description, keyPoints: d.keyPoints ?? [], categories, ...(categories[0] && { primary: categories[0] }), elements: [],
    ...(d.minutes && { minutes: d.minutes }), ...(d.goalie && { goalies: 1 }), ...(d.material && { material: d.material }),
    offIce: /\b(off-ice|dryland)\b/i.test(d.title + d.paras.join(' ')), draft: true, scene: { rink: 'full', items: [] },
    source: d.source, ...(d.image && { image: d.image }), updatedAt: d.updatedAt,
  })
  return id
}
// The same plan can be published twice (practice plan PDF and practice planner): keep one collection.
function collect(name, drillIds, description) {
  const ids = [...new Set(drillIds)]
  if (!ids.length || collections.some((c) => c.drillIds.join() === ids.join())) return
  let id = `usah-c-${slug(name)}`
  while (collections.some((c) => c.id === id)) id += '-2'
  collections.push({ id, name: `USA Hockey: ${name}`, ...(description && { description }), drillIds: ids })
}

// ---------- PDF layout: words → lines, diagrams, crops ----------
function pdf(path) {
  return sh('pdftotext', ['-bbox', path, '-']).split('<page ').slice(1).map((pg, i) => ({
    n: i + 1, path, W: Number(pg.match(/width="([\d.]+)"/)[1]), H: Number(pg.match(/height="([\d.]+)"/)[1]),
    words: [...pg.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)]
      .map(([, a, b, c, d, t]) => ({ x0: +a, y0: +b, x1: +c, y1: +d, h: d - b, t: clean(t) })).filter((w) => w.t),
  }))
}

// Lines per column (left/right of colX). Superscripts (3rd) join their row; a right-aligned "(7 minutes)" joins its heading.
function lines(pg, colX) {
  const rows = []
  for (const w of [...pg.words].sort((a, b) => b.h - a.h)) {
    const r = rows.find((r) => Math.abs(r.y1 - w.y1) < 2.5 || (w.h < 0.85 * r.h && w.y0 >= r.y0 - 2 && w.y1 <= r.y1 + 1))
    if (r) r.ws.push(w)
    else rows.push({ y0: w.y0, y1: w.y1, h: w.h, ws: [w] })
  }
  const out = []
  for (const r of rows) {
    const segs = []
    for (const w of r.ws.sort((a, b) => a.x0 - b.x0)) {
      const s = segs.at(-1)
      if (s && w.x0 - s.x1 <= 12) { s.t += (w.h < 0.85 * r.h && w.x0 - s.x1 < 2 ? '' : ' ') + w.t; s.x1 = w.x1 }
      else segs.push({ x0: w.x0, x1: w.x1, y0: r.y0, y1: r.y1, h: r.h, t: w.t })
    }
    const merged = []
    for (const s of segs) {
      const prev = merged.at(-1)
      if (prev && (/^\(\d+\s*minutes?\)$/.test(s.t) || (prev.x0 < colX) === (s.x0 < colX))) { prev.t += ' ' + s.t; prev.x1 = s.x1 }
      else merged.push(s)
    }
    out.push(...merged.map((s) => ({ ...s, col: s.x0 < colX ? 0 : 1 })))
  }
  return out.sort((a, b) => a.col - b.col || a.y0 - b.y0 || a.x0 - b.x0)
}

// Diagram areas: render the page, blank out the words, find large dark blobs and split stacked ones at blank rows.
// Thin rules, box borders (low density) and text boxes (much text inside) are dropped.
const figCache = new Map()
function figures(pg) {
  const key = `${pg.path}#${pg.n}`
  if (figCache.has(key)) return figCache.get(key)
  const pgm = sh('pdftoppm', ['-r', 72, '-f', pg.n, '-l', pg.n, '-gray', pg.path], 'buffer')
  const m = pgm.toString('latin1', 0, 40).match(/^P5\s+(\d+)\s+(\d+)\s+\d+\s/)
  const [w, h] = [+m[1], +m[2]]
  const px = pgm.subarray(m[0].length)
  const sx = w / pg.W, sy = h / pg.H
  const dark = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) dark[i] = px[i] < 225 ? 1 : 0
  for (const o of pg.words) {
    for (let y = Math.max(0, Math.floor(o.y0 * sy)); y <= Math.min(h - 1, Math.ceil(o.y1 * sy)); y++) dark.fill(0, y * w + Math.max(0, Math.floor(o.x0 * sx)), y * w + Math.min(w, Math.ceil(o.x1 * sx) + 1))
  }
  const R = 2, near = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!dark[y * w + x]) continue
    for (let yy = Math.max(0, y - R); yy <= Math.min(h - 1, y + R); yy++) near.fill(1, yy * w + Math.max(0, x - R), yy * w + Math.min(w, x + R + 1))
  }
  const seen = new Uint8Array(w * h), boxes = []
  for (let i = 0; i < w * h; i++) {
    if (!near[i] || seen[i]) continue
    let [x0, y0, x1, y1] = [w, h, 0, 0]
    const stack = [i]
    seen[i] = 1
    while (stack.length) {
      const j = stack.pop(), x = j % w, y = (j - x) / w
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
      for (const k of [x > 0 && j - 1, x < w - 1 && j + 1, y > 0 && j - w, y < h - 1 && j + w]) if (k !== false && near[k] && !seen[k]) { seen[k] = 1; stack.push(k) }
    }
    // split at runs of >= 3 blank rows
    let start = -1, blank = 0
    const rowDark = (y) => { for (let x = x0; x <= x1; x++) if (dark[y * w + x]) return true; return false }
    for (let y = y0; y <= y1 + 3; y++) {
      const d = y <= y1 && rowDark(y)
      if (d) { if (start < 0) start = y; blank = 0 } else if (start >= 0 && ++blank >= 3) { boxes.push([x0, start, x1, y - blank]); start = -1 }
    }
  }
  const figs = []
  for (const [bx0, by0, bx1, by1] of boxes) {
    let [x0, y0, x1, y1, n] = [bx1, by1, bx0, by0, 0]
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) if (dark[y * w + x]) { n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
    const f = { x0: x0 / sx, y0: y0 / sy, x1: (x1 + 1) / sx, y1: (y1 + 1) / sy }
    const area = (f.x1 - f.x0) * (f.y1 - f.y0)
    const words = pg.words.filter((o) => (o.x0 + o.x1) / 2 > f.x0 && (o.x0 + o.x1) / 2 < f.x1 && (o.y0 + o.y1) / 2 > f.y0 && (o.y0 + o.y1) / 2 < f.y1)
    const textArea = words.reduce((s, o) => s + (o.x1 - o.x0) * (o.y1 - o.y0), 0)
    if (f.x1 - f.x0 >= 40 && f.y1 - f.y0 >= 30 && n / ((x1 - x0 + 1) * (y1 - y0 + 1)) >= 0.08 && textArea / area < 0.15 && area < 0.6 * pg.W * pg.H) figs.push(f)
  }
  figCache.set(key, figs)
  return figs
}
const inside = (l, figs) => figs.some((f) => (l.x0 + l.x1) / 2 > f.x0 - 2 && (l.x0 + l.x1) / 2 < f.x1 + 2 && (l.y0 + l.y1) / 2 > f.y0 - 2 && (l.y0 + l.y1) / 2 < f.y1 + 2)
const union = (fs) => fs.length ? { x0: Math.min(...fs.map((f) => f.x0)), y0: Math.min(...fs.map((f) => f.y0)), x1: Math.max(...fs.map((f) => f.x1)), y1: Math.max(...fs.map((f) => f.y1)) } : undefined

// JPEG of a page area, at most 600 px on the longer side and ideally under 60 KB.
const cropCache = new Map()
function crop(pg, box, pad = 4) {
  if (!box) return undefined
  const [x0, y0] = [Math.max(0, box.x0 - pad), Math.max(0, box.y0 - pad)]
  const [x1, y1] = [Math.min(pg.W, box.x1 + pad), Math.min(pg.H, box.y1 + pad)]
  const key = [pg.path, pg.n, x0, y0, x1, y1].map((v) => (typeof v === 'number' ? v.toFixed(1) : v)).join()
  if (cropCache.has(key)) return cropCache.get(key)
  let url
  for (const [f, q] of [[1, 75], [1, 60], [0.8, 60], [0.65, 55]]) {
    const s = f * Math.min(600 / (x1 - x0), 600 / (y1 - y0), 2) // pixels per point
    sh('pdftoppm', ['-r', (72 * s).toFixed(2), '-f', pg.n, '-l', pg.n, '-x', Math.round(x0 * s), '-y', Math.round(y0 * s), '-W', Math.round((x1 - x0) * s), '-H', Math.round((y1 - y0) * s), '-jpeg', '-jpegopt', `quality=${q}`, '-singlefile', pg.path, join(TMP, 'crop')])
    const buf = readFileSync(join(TMP, 'crop.jpg'))
    url = `data:image/jpeg;base64,${buf.toString('base64')}`
    if (buf.length < 60000) break
  }
  cropCache.set(key, url)
  return url
}

// Lines → paragraphs: a gap, a label ("Race:", "1.", "A)", bullet) or a line ending in ":" starts a new one.
const LABEL = /^(?:[A-Z][\w’'/&().\- ]{0,30}:\s|\d{1,2}[.)]\s|[A-H][.)]\s|[•—–]\s|\*)/
function paras(ls) {
  const out = []
  let prev
  for (const l of ls) {
    const cont = prev && !LABEL.test(l.t) && !/:$/.test(prev.t) && (prev.col === l.col ? l.y0 - prev.y1 < 0.35 * l.h : !/[.!?]$/.test(prev.t))
    if (cont) out[out.length - 1] += (/[a-z]-$/.test(out.at(-1)) && /^[a-z]/.test(l.t) ? '' : ' ') + l.t
    else out.push(l.t)
    prev = l
  }
  return out
}

// Diagram for a drill: the blobs below its heading in its own column (drill boxes), else the blob beside it
// (rink in the other column) that overlaps its rows the most.
function pick(d, figs, colX) {
  const col = (f) => ((f.x0 + f.x1) / 2 < colX ? 0 : 1)
  const own = figs.filter((f) => col(f) === d.col && (f.y0 + f.y1) / 2 > d.y0 && (f.y0 + f.y1) / 2 < d.next)
  if (own.length) return union(own)
  const ov = (f) => Math.min(f.y1, d.gy1) - Math.max(f.y0, d.gy0)
  return figs.filter((f) => col(f) !== d.col && ov(f) > 0).sort((a, b) => ov(b) - ov(a))[0]
}
function ranges(ds, heads, pg) {
  for (const d of ds) {
    d.next = Math.min(pg.H, ...heads.filter((h) => h.col === d.col && h.y0 > d.y0 + 1).map((h) => h.y0))
    d.gy0 ??= d.y0
    d.gy1 ??= Math.max(d.y0 + 12, ...d.lines.filter((l) => l.col === d.col).map((l) => l.y1))
  }
}

// ---------- practice plan pages (8U/10U/12U/14U): sections, "Name (N minutes)" headings ----------
const SECTION = /^(WARMUP|WARM-UP|STATIONS?|SKILL DRILLS|DRILLS|GAMES?|COACHING TIPS?|COOL ?DOWN)\b:?\s*(.*)$/
const MINUTES = /^(.+?)\s*\((\d+)\s*minutes?\)$/
const GOALIES = /^Goalies?:\s*(\S+(?: \S+){0,5}?)(?:\s*\((\d+)\s*minutes?\))?$/
const FOOTER = /Practice Planner \|? ?\d*$|^\d+ \| USA Hockey/
function planPage(pg, file, suffix) {
  const colX = pg.W * 0.48
  const figs = figures(pg)
  const ls = lines(pg, colX).filter((l) => l.h >= 6.5 && !inside(l, figs) && !FOOTER.test(l.t))
  const title = ls.find((l) => l.h >= 18).t
  const top = Math.min(...ls.filter((l) => SECTION.test(l.t)).map((l) => l.y0))
  const header = ls.filter((l) => l.y0 < top && l.h < 18).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0).map((l) => l.t)
  const ds = [], heads = [], notes = []
  let sec = '', cur = null
  for (const l of ls.filter((l) => l.y0 >= top)) {
    let m
    if ((m = SECTION.exec(l.t))) {
      sec = cap(m[1])
      cur = null
      heads.push(l)
      if (m[2]) notes.push(`${sec}: ${m[2]}`)
    } else if ((m = MINUTES.exec(l.t) ?? GOALIES.exec(l.t))) {
      const goalie = /^Goalies?:/.test(l.t)
      const name = m[1].replace(/^Goalies?:\s*/, '')
      const prefix = name.match(/^(Station \d+|Drill \d+|Game \d+)\s*[:–-]\s*/)?.[0]
      ds.push(cur = { title: name.slice(prefix?.length ?? 0), prefix: goalie ? 'Goalies' : prefix?.replace(/\s*[:–-]\s*$/, ''), minutes: +m[2] || undefined, sec, goalie, col: l.col, y0: l.y0, lines: [] })
      heads.push(l)
    } else if (cur) cur.lines.push(l)
    else notes.push(`${sec}: ${l.t}`)
  }
  ranges(ds, heads, pg)
  const ids = ds.map((d) => add('plan', {
    title: d.title, paras: paras(d.lines), minutes: d.minutes, goalie: d.goalie,
    context: [title, d.sec, d.prefix].filter(Boolean).join(' · '),
    source: `${file.url}#page=${pg.n}`, image: crop(pg, pick(d, figs, colX)), updatedAt: file.date,
  }))
  if (ds.length < 3 || ds.some((d) => !d.lines.length)) throw new Error(`${file.url} S. ${pg.n}: Plan nicht erkannt`)
  collect(`${title}${suffix}`, ids, [...header, ...notes].join('\n'))
}

// ---------- 12U advanced one-page plans: "Name (min/total)" headings, "Station 1: Name – text" sub-drills ----------
const SUB = /^(?:Station \d+:|[A-H]\)|\d\))\s*(.+?)\s+[–-]\s+(.*)$/
const GOALIE_SUB = /^(Goalie (?:Movement Drills?|Fundamental Saves?)):\s*(.+)$/
function advancedPage(pg, file) {
  const colX = 300
  const figs = figures(pg)
  const ls = lines(pg, colX).filter((l) => l.h >= 6.5 && !inside(l, figs))
  const header = ls.filter((l) => l.y0 < 85).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0).map((l) => l.t).join(' ')
  const title = header.match(/^(12U Advanced:.*?)\s+Number of/)[1]
  const body = []
  for (const l of ls.filter((l) => l.y0 >= 85)) { // headings can wrap onto a second line
    const prev = body.at(-1)
    if (prev && l.h >= 11 && prev.h >= 11 && prev.col === l.col && l.y0 - prev.y1 < 6 && !/\(\d+\/\d+\)$/.test(prev.t)) { prev.t += ' ' + l.t; prev.y1 = l.y1 } else body.push({ ...l })
  }
  const ds = [], heads = []
  let sec = null, cur = null
  for (const l of body) {
    let m
    if (l.h >= 11) {
      m = l.t.match(/^(.*?)\s*\((\d+)\s*\/\s*(\d+)\)$/)
      if (!m) throw new Error(`${file.url}: unbekannte Überschrift «${l.t}»`)
      ds.push(sec = cur = { title: m[1], minutes: +m[2], each: +(m[1].match(/(?:@|x)\s*(\d+)\s*min/)?.[1] ?? 0) || undefined, col: l.col, y0: l.y0, lines: [], subs: [] })
      heads.push(l)
    } else if ((m = SUB.exec(l.t)) && sec) {
      ds.push(cur = { title: m[1], minutes: sec.each, prefix: l.t.match(/^(Station \d+|[A-H]\)|\d\))/)[1].replace(/\)$/, ''), parent: sec, col: l.col, y0: l.y0, lines: [{ ...l, t: m[2] }] })
      sec.subs.push(cur)
      heads.push(l)
    } else if ((m = GOALIE_SUB.exec(l.t))) {
      ds.push(cur = { title: m[2], prefix: m[1], goalie: true, parent: sec, col: l.col, y0: l.y0, lines: [] })
      heads.push(l)
    } else if (cur) cur.lines.push(l)
  }
  ranges(ds, heads, pg)
  for (const d of ds.filter((d) => d.subs?.length)) {
    const end = Math.max(...d.subs.filter((s) => s.col === d.col).map((s) => s.gy1), d.gy1)
    for (const s of d.subs) [s.gy0, s.gy1] = [d.y0, end]
  }
  const ids = ds.filter((d) => d.lines.length || !d.subs?.length).map((d) => add('advanced', {
    title: d.title, paras: paras(d.lines), minutes: d.minutes, goalie: d.goalie,
    context: [title, d.parent?.title, d.prefix].filter(Boolean).join(' · '),
    source: `${file.url}#page=${pg.n}`, image: crop(pg, pick(d, figs, colX)), updatedAt: file.date,
  }))
  if (ids.length < 3) throw new Error(`${file.url}: Plan nicht erkannt`)
  collect(title, ids, header.replace(/^12U Advanced:.*?\s+(?=Number of)/, ''))
}

// ---------- goalie season plans: "1) Name … 5 min.", objective/organization right, key points + photo left ----------
function goaliePlan(file, name) {
  const ids = []
  let intro = ''
  for (const pg of pdf(file.path)) {
    const ls = lines(pg, 200)
    if (pg.n === 1) intro = ls.filter((l) => l.col === 1 && l.y0 < 60).map((l) => l.t).join(' ')
    const heads = ls.filter((l) => l.col === 0 && /^\d+\)\s/.test(l.t) && l.x0 < 40)
    const list = sh('pdfimages', ['-list', '-f', pg.n, '-l', pg.n, pg.path]).split('\n').slice(2).map((r) => r.trim().split(/\s+/)).filter((r) => r.length > 4)
    const photos = list.map((r, i) => ({ i, w: +r[3], enc: r[8] })).filter((p) => p.w < 1000)
    let files = []
    if (photos.length === heads.length && photos.every((p) => p.enc === 'jpeg')) {
      rmSync(join(TMP, 'img'), { recursive: true, force: true })
      mkdirSync(join(TMP, 'img'))
      sh('pdfimages', ['-j', '-f', pg.n, '-l', pg.n, pg.path, join(TMP, 'img', 'p')])
      const all = readdirSync(join(TMP, 'img')).sort()
      files = photos.map((p) => readFileSync(join(TMP, 'img', all[p.i])))
    }
    heads.forEach((h, k) => {
      const end = heads[k + 1]?.y0 ?? 745
      const inRange = (l) => l.y0 > h.y0 + 2 && l.y0 < end - 2 && l.y0 < 745
      const right = ls.filter((l) => l.col === 1 && inRange(l) && !/^\d+ min\.$/.test(l.t))
      const left = ls.filter((l) => l.col === 0 && inRange(l) && l.x0 < 60)
      const kp = left.findIndex((l) => /^KEYPOINTS:/.test(l.t))
      const keyPoints = kp < 0 ? [] : left.slice(kp + 1).map((l) => l.t).join(' ').split(/,\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean)
      const parts = []
      for (const l of right) {
        const m = l.t.match(/^(OBJECTIVE|ORGANIZATION|VARIATION|GOALIE):\s*(.*)$/)
        if (m) parts.push({ label: cap(m[1]), t: m[2] ? [m[2]] : [] })
        else parts.at(-1)?.t.push(l.t)
      }
      const ps = parts.filter((p) => p.t.length).map((p) => `${p.label}: ${p.t.join(' ')}`)
      const minutes = +ls.find((l) => l.col === 1 && Math.abs(l.y0 - h.y0) < 3 && /^\d+ min\.$/.test(l.t))?.t.match(/\d+/)[0] || undefined
      ids.push(add('goalie plans', {
        title: h.t.replace(/^\d+\)\s*/, ''), paras: ps, keyPoints, minutes, goalie: true,
        context: `${name} · Drill ${h.t.match(/^\d+/)[0]}`, source: `${file.url}#page=${pg.n}`,
        image: files[k] && files[k].length < 80000 ? `data:image/jpeg;base64,${files[k].toString('base64')}` : undefined, updatedAt: file.date,
      }))
    })
  }
  if (ids.length < 10) throw new Error(`${file.url}: Torhüterplan nicht erkannt`)
  collect(`Goalies – ${name}`, ids, intro)
  return ids
}

// ---------- goalie drill library: one NTDP drill per PDF (diagram bottom right) or .doc (text only) ----------
function goalieDrill(file, title, group) {
  let desc = [], kps = [], image
  if (file.path.endsWith('.doc')) {
    const t = clean(sh('textutil', ['-convert', 'txt', '-stdout', file.path])).replace(/\r/g, '')
    const d = t.split(/Drill Description:\s*\n/)[1]?.split(/Key Teaching Points:\s*\n/) ?? []
    desc = (d[0] ?? '').split(/\n\s*\n/).map((p) => p.split('\n').map((s) => s.trim()).filter((s) => s && s !== '.').join('\n')).filter(Boolean)
    let label = ''
    for (const s of (d[1] ?? '').split(/\n\s*\n\s*\n|SHAPE/)[0].split('\n').map((s) => s.trim()).filter(Boolean)) {
      if (/^[\w ]+:$/.test(s)) label = s + ' '
      else kps.push(label + s)
    }
  } else {
    const pages = pdf(file.path)
    let mode = ''
    for (const pg of pages) {
      const ls = lines(pg, pg.W / 2)
      for (const l of ls.filter((l) => l.col === 0 && l.y0 > 110 && !/^(NATIONAL TEAM|GOALTENDER DRILLS)/.test(l.t))) {
        if (/^Drill Description:/.test(l.t)) mode = 'd'
        else if (/^Key Teaching Points:/.test(l.t)) {
          mode = 'k'
          const figs = figures(pg).filter((f) => (f.x0 + f.x1) / 2 > pg.W / 2 && f.y1 > l.y0)
          const labels = ls.filter((o) => o.col === 1 && o.y0 > l.y0)
          image = crop(pg, union([...figs, ...labels]), 10)
        } else (mode === 'k' ? kps : desc).push(l)
      }
    }
    desc = paras(desc)
    kps = paras(kps).map((s) => s.replace(/^\d+[.)]\s*/, ''))
  }
  if (!desc.length) throw new Error(`${file.url}: Torhüterübung nicht erkannt`)
  return add('goalie drills', { title, paras: desc, keyPoints: kps, goalie: true, context: `Goaltending drills · ${group}`, source: file.url, image, updatedAt: file.date })
}

// ---------- small-area games manual: two games per page, title (16 pt), text, NOTES/COMMENTS ----------
function sagManual(file) {
  const groups = new Map()
  let age = ''
  for (const pg of pdf(file.path)) {
    const figs = figures(pg)
    const ls = lines(pg, pg.W * 0.48)
    const big = ls.find((l) => l.h >= 40 && /and-Under/.test(l.t))
    if (big) age = big.t
    age = ls.find((l) => /^[\d\-, ]+and-Under \| \d+$/.test(l.t))?.t.replace(/ \|.*/, '') ?? age
    const titles = []
    for (const l of ls.filter((l) => l.h >= 15.5 && l.h < 20).sort((a, b) => a.y0 - b.y0)) {
      const prev = titles.at(-1)
      if (prev && l.y0 - prev.y1 < 8) { prev.t += ' ' + l.t; prev.y1 = l.y1 } else titles.push({ ...l })
    }
    const body = ls.filter((l) => l.h > 11 && l.h < 14.5 && !inside(l, figs) && !/and-Under \| \d+$|^\d+$|USA Hockey Small Area|^\|$/.test(l.t))
    let lo = 0
    titles.forEach((t, k) => {
      const end = titles[k + 1]?.y0 ?? pg.H
      const own = body.filter((l) => l.y0 > t.y0 && l.y0 < end - 2)
      const notes = ls.find((l) => /^NOTES\/COMMENTS/.test(l.t) && l.y0 > t.y0 && l.y0 < end)
      const main = own.filter((l) => !notes || !(l.col === notes.col && l.y0 > notes.y0))
      const comments = notes ? own.filter((l) => l.col === notes.col && l.y0 > notes.y0).map((l) => l.t).join(' ') : ''
      const hi = titles[k + 1] ? (Math.max(t.y1, ...own.map((l) => l.y1)) + titles[k + 1].y0) / 2 : pg.H
      const box = union(figs.filter((f) => (f.y0 + f.y1) / 2 > lo && (f.y0 + f.y1) / 2 < hi))
      lo = hi
      const id = add('small-area games', {
        title: t.t, paras: [...paras(main), comments && `Notes/Comments: ${comments}`].filter(Boolean),
        context: `Small Area Competitive Games · ${age}`, source: `${file.url}#page=${pg.n}`, image: crop(pg, box), updatedAt: file.date,
      })
      groups.set(age, [...(groups.get(age) ?? []), id])
    })
  }
  for (const [g, ids] of groups) collect(`Small-Area Games – ${g}`, ids)
}

// ---------- Teaching Concepts Through Small-Area Games: one game per page, grouped by concept ----------
function teachingConcepts(file) {
  const groups = new Map()
  for (const pg of pdf(file.path)) {
    const ls = lines(pg, pg.W * 0.48).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
    const ci = ls.findIndex((l) => l.t === 'CONCEPTS')
    if (ci < 0) continue
    const concept = ls.find((l) => l.h > 25 && l.h < 35)?.t
    const title = ls.filter((l) => l.h > 35 && l.y0 < ls[ci].y0).map((l) => l.t).join(' ')
    const tags = ls.slice(ci + 1).filter((l) => l.h > 14 && l.h < 16).map((l) => l.t).join(' ')
    const body = ls.slice(ci + 1).filter((l) => l.h > 11 && l.h < 14 && !/Teaching Concepts Through/.test(l.t))
    const bottom = Math.max(...body.map((l) => l.y1))
    const id = add('teaching concepts', {
      title, paras: [`Concepts: ${tags}`, ...paras(body)], context: `Teaching Concepts Through Small-Area Games · ${concept}`,
      source: `${file.url}#page=${pg.n}`, image: crop(pg, union(figures(pg).filter((f) => f.y0 > bottom))), updatedAt: file.date,
    })
    groups.set(concept, [...(groups.get(concept) ?? []), id])
  }
  for (const [g, ids] of groups) collect(`Teaching Concepts – ${g}`, ids)
}

// ---------- HTML articles ----------
// ADM Drill of the Month: <p><strong>Purpose:</strong> …</p>; "Coaching Points" become key points, "Equipment" the material.
async function adm() {
  const ids = [], byAge = new Map()
  for (let n = 1; ; n++) {
    const list = await page(`https://www.admkids.com/page/show/915539?match_option=0&news_aggregator=1146622&tags=2284974&page=${n}`)
    for (const [, art] of list.matchAll(/<h4>\s*<a href="\/news_article\/show\/(\d+)/g)) {
      const url = `https://www.admkids.com/news_article/show/${art}`
      const html = await page(url)
      const head = text(html.match(/<div class="newsItemElement[^>]*>\s*<h2[^>]*>([\s\S]*?)<\/h2>/)[1])
      const body = html.slice(html.indexOf('<div class="newsContentNode'), html.indexOf('<p class="newsTags'))
      const ps = [...body.matchAll(/<div class="text clearfix">([\s\S]*?)<\/div>/g)].flatMap(([, t]) => [...t.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1]))
      if (!ps.some((p) => /^\s*<(strong|b)>\s*(Purpose|Drill|Setup|Procedure|Structure)/i.test(p))) continue // articles, not drills
      const desc = [], keyPoints = []
      let material, label = ''
      for (const p of ps) {
        const l = text(p.match(/^\s*<(?:strong|b)>([^<]{1,40})<\/(?:strong|b)>/)?.[1] ?? '').replace(/:$/, '')
        const t = text(l ? p.replace(/^\s*<(?:strong|b)>[^<]*<\/(?:strong|b)>/, '') : p).replace(/^:\s*/, '')
        if (l) label = l
        if (!t) continue
        if (/^Coaching Points$/i.test(label)) keyPoints.push(t)
        else if (/^Equipment/i.test(label)) material = t
        else desc.push(l ? `${l}: ${t}` : t)
      }
      const age = head.match(/^(\d+U\+?(?:\s*[-/,]\s*\d+U?\+?)*)\s*:?\s+/)
      const image = body.match(/heroPhotoElement">\s*(?:<a[^>]*>\s*)?<img[^>]*src="(https:[^"]+)"/)?.[1]
      const id = add('adm', {
        title: age ? head.slice(age[0].length) : head, paras: desc, keyPoints, material, context: `ADM Drill of the Month${age ? ' · ' + age[1] : ''}`,
        source: url, image, updatedAt: usDate(html.match(/class="newsDate">([^<]+)</)[1]),
      })
      ids.push(id)
      if (age) {
        const nums = age[1].match(/\d+/g).map(Number)
        const span = age[1].includes('+') ? [nums[0], 18] : age[1].includes('-') ? [nums[0], nums.at(-1)] : null
        for (const a of [6, 8, 10, 12, 14, 16, 18].filter((a) => (span ? a >= span[0] && a <= span[1] : nums.includes(a)))) byAge.set(a, [...(byAge.get(a) ?? []), id])
      }
    }
    if (!/class="next_page" rel="next"/.test(list)) break
  }
  collect('ADM Drill of the Month', ids)
  for (const a of [...byAge.keys()].sort((x, y) => x - y)) collect(`ADM Drill of the Month – ${a}U`, byAge.get(a))
}

// Player development camp practice plans: one <h3> per drill with key teaching points, progression, goalie notes.
// shortcut: the three plan articles are listed by hand (found via the 2018 camp pages), search again if USA Hockey posts more.
const CAMP_PLANS = [932931, 935497, 931303]
async function camps() {
  for (const art of CAMP_PLANS) {
    const url = `https://teamusa.usahockey.com/news_article/show/${art}`
    const html = await page(url)
    const name = text(html.match(/<h2 class="titleText">([\s\S]*?)<\/h2>/)[1])
    const date = usDate(html.match(/class="newsDate">([^<]+)</)[1])
    const body = html.slice(html.indexOf('<div class="newsContentNode'), html.indexOf('<p class="newsTags'))
    const ids = []
    let details = ''
    for (const chunk of body.split(/<h3[^>]*>/).slice(1)) {
      const title = text(chunk.slice(0, chunk.indexOf('</h3>')))
      const ps = [...chunk.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1]).filter((p) => !/Mobile Coach/.test(p))
      if (title === 'Practice Plan Details') { details = ps.map(text).join('\n'); continue }
      const desc = [], keyPoints = []
      let minutes
      for (const p of ps) {
        const t = text(p)
        if (!t) continue
        if (/^\d+ Minutes$/i.test(t)) minutes = parseInt(t)
        else if (/^Key Teaching Points:/i.test(t)) {
          const kp = t.replace(/^Key Teaching Points:\s*/i, '')
          keyPoints.push(...kp.split(kp.includes(';') ? /;\s*/ : /(?<=\.)\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean))
        } else desc.push(t)
      }
      const image = [...chunk.matchAll(/<img[^>]*src="(https:[^"]+)"/g)].map((m) => m[1]).find((s) => !/App_Store|get_it_on_play/.test(s))
      ids.push(add('camp plans', { title, paras: desc, keyPoints, minutes, context: name, source: url, image, updatedAt: date }))
    }
    collect(name, ids, details)
  }
}

// ---------- PDF sources ----------
const pdfLinks = (html) => [...html.matchAll(/<a [^>]*href="(https:\/\/cdn\d\.sportngin\.com\/attachments\/document\/[^"?]+\.(?:pdf|doc))[^"]*"[^>]*>([\s\S]*?)<\/a>/g)].map(([, url, t]) => ({ url, name: text(t) }))
const tabs = async (url) => {
  const html = await page(url)
  const out = []
  for (const [, href, label] of html.matchAll(/href="(\/layout_container\/show_layout_tab\?[^"]+)"[^>]*>\s*(?:<span>)?([^<]+)/g)) out.push({ label: text(label), html: await page(new URL(href.replace(/&amp;/g, '&'), url).href) })
  return { html, tabs: out }
}

async function plans() {
  const { tabs: ages } = await tabs('https://www.usahockey.com/practiceplans')
  const guides = pdfLinks(await page('https://www.usahockey.com/practiceplannerguides'))
  const files = [...ages.flatMap((t) => pdfLinks(t.html).map((l) => ({ ...l, group: t.label }))), ...guides.map((l) => ({ ...l, group: 'Practice Planner' }))]
  const seen = new Set()
  for (const l of files) {
    const path = l.url.replace(/^https:\/\/cdn\d\./, '')
    if (seen.has(path) || /off-ice|philosophy/i.test(l.url)) continue
    seen.add(path)
    const file = await download(l.url)
    for (const pg of pdf(file.path)) {
      const first = lines(pg, pg.W * 0.48).sort((a, b) => a.y0 - b.y0)[0]
      if (/^12U Advanced:/.test(first?.t ?? '')) advancedPage(pg, file)
      else if (first?.h >= 18 && /^\d+U .*Practice Plan \d+/.test(first.t)) planPage(pg, file, l.group === 'Practice Planner' ? ' (Practice Planner)' : '')
    }
  }
}

async function goalies() {
  const { tabs: ages } = await tabs('https://www.usahockeygoaltending.com/page/show/2872653-goaltending-practice-plans')
  for (const t of ages) for (const l of pdfLinks(t.html)) goaliePlan(await download(l.url), `${/Foundation/.test(l.url) ? 'Foundation' : 'Skills'} Stage ${l.name.replace(/ - /, ' – ')}`)
  // shortcut: the drill library pages are listed by hand (they hang off a JavaScript menu), update if the site is reorganised.
  const LIB = { 1929502: 'Movement – Beginner', 1929503: 'Movement – Intermediate/Advanced', 1929504: 'Movement – Advanced', 1929354: 'Fundamental Save – Beginner', 1929345: 'Fundamental Save – Intermediate/Advanced', 1929399: 'Fundamental Save – Advanced', 1929489: 'Game Situation – Intermediate/Advanced', 1929490: 'Game Situation – Advanced', 1929512: 'Team Drills – Beginner', 1929513: 'Team Drills – Intermediate/Advanced' }
  for (const [id, group] of Object.entries(LIB)) {
    const links = pdfLinks(await page(`https://www.usahockeygoaltending.com/page/show/${id}`))
    if (!links.length) throw new Error(`Torhüter-Seite ${id}: keine Übungen`)
    const ids = []
    for (const l of links) ids.push(goalieDrill(await download(l.url), l.name, group))
    collect(`Goalie Drills – ${group}`, ids)
  }
}

async function smallAreaGames() {
  const links = pdfLinks(await page('https://www.usahockey.com/smallareagames'))
  for (const l of links) {
    const file = await download(l.url)
    if (/Teaching-Concepts/i.test(l.url)) teachingConcepts(file)
    else sagManual(file)
  }
}

try {
  await adm()
  await camps()
  await plans()
  await goalies()
  await smallAreaGames()
} finally {
  rmSync(TMP, { recursive: true, force: true })
}

const all = [...drills.values()]
const bad = all.filter((d) => !d.title || !d.description || /<\/?[a-z][^>]*>|&(#\d+|[a-z]+);/i.test(d.title + d.description + d.keyPoints.join(' ')))
if (bad.length) throw new Error(`Unvollständig oder HTML-Reste: ${bad.map((d) => d.id).join(', ')}`)
const MIN = { adm: 30, 'camp plans': 15, plan: 300, advanced: 25, 'goalie plans': 80, 'goalie drills': 50, 'small-area games': 50, 'teaching concepts': 30 }
const short = Object.entries(MIN).filter(([k, n]) => (counts[k] ?? 0) < n)
if (short.length) throw new Error(`Zu wenige Übungen (Seitenstruktur geändert?): ${short.map(([k]) => `${k} ${counts[k] ?? 0}`).join(', ')}`)
collections.unshift({ id: 'usah-c-all', name: 'USA Hockey (alle)', drillIds: all.map((d) => d.id) })
mkdirSync(new URL('../private/', import.meta.url), { recursive: true })
const out = JSON.stringify({ version: 1, drills: all, collections, sessions: [] }, null, 2)
writeFileSync(new URL('../private/usahockey.json', import.meta.url), out)
console.log(`${all.length} Übungen (${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ')}), ${collections.length} Sammlungen, ${(out.length / 1e6).toFixed(1)} MB → private/usahockey.json`)
