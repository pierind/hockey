// Fetches the public «Free Drills» of hockeyshare.com (community drills, viewable without login) into a backup file for «Backup importieren → Hinzufügen».
// Private use only: the output goes to private/ (gitignored) and must never be committed, this repo is public.
// Polite crawl: robots.txt allows /drill/ and /drills/ (no Crawl-delay, checked 2026-10), one request per ~1.1 s, pages cached in HS_CACHE so reruns don't refetch.
// Usage: HS_CACHE=/some/dir node scripts/import-hockeyshare.mjs [--limit N]   → private/hockeyshare.json (~1,234 drills, ~25 min uncached)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { oneCollection } from './one-collection.mjs'

const BASE = 'https://www.hockeyshare.com'
const UA = 'hockey-planner-private-importer/1.0 (personal drill library, 1 req/s)'
const CACHE = process.env.HS_CACHE ?? join(tmpdir(), 'hockeyshare-cache')
const arg = process.argv.indexOf('--limit')
const LIMIT = arg > 0 ? Number(process.argv[arg + 1]) : Infinity
mkdirSync(CACHE, { recursive: true })

let last = 0
async function get(path) {
  const file = join(CACHE, path.replace(/[^\w-]+/g, '_') + '.html')
  if (existsSync(file)) return readFileSync(file, 'utf8')
  for (let attempt = 1; ; attempt++) {
    await new Promise((r) => setTimeout(r, Math.max(0, last + 1100 - Date.now())))
    last = Date.now()
    const res = await fetch(BASE + path, { headers: { 'User-Agent': UA } })
    if (res.ok) {
      const html = await res.text()
      if (/\/account\/login/.test(res.url)) throw new Error(`${path}: Login verlangt`)
      writeFileSync(file, html)
      return html
    }
    if (attempt >= 3 || ![429, 500, 502, 503, 504].includes(res.status)) throw new Error(`${path}: HTTP ${res.status}`)
    await new Promise((r) => setTimeout(r, (Number(res.headers.get('retry-after')) || 30) * 1000))
  }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '' }
const text = (html) => html
  .replace(/<br\s*\/?>|<\/(p|div|li)>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m))
  .replace(/\r/g, '').split('\n').map((l) => l.replace(/[ \t ]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()

// HockeyShare category → SIHF Erscheinungsform, only where the meaning clearly matches.
const EF = [[/^skating$/, 'EF03'], [/^(puck control|stickhandling)$/, 'EF05'], [/^passing$/, 'EF06'], [/^shooting$/, 'EF07'],
  [/^power ?play$|^(\d) ?(on|v|-on-) ?(\d)$/, 'EF08'], [/^1 ?(on|v|-on-) ?1$|^battles?$|^(body )?checking$/, 'EF09'], [/^goalies?$|^goaltending$/, 'EF10']]
function sihf(category) {
  const c = category.toLowerCase()
  const odd = c.match(/^(\d) ?(?:on|v|-on-) ?(\d)$/)
  if (odd && Number(odd[1]) <= Number(odd[2])) return c.match(/^1 ?(?:on|v|-on-) ?1$/) ? ['EF09'] : [] // 3 on 3 etc. is not an odd-man situation
  return EF.filter(([re]) => re.test(c)).map(([, id]) => id)
}

// 1. Drill list (24 per page) and the standard categories from the sidebar.
const first = await get('/drills/free')
const pages = Number(first.match(/Page 1 of (\d+)/)?.[1])
const standard = [...first.matchAll(/<a href="\/drills\/free\/([\w-]+)"[^>]*data-category-id="(\d+)">\s*<span>([^<]+)<\/span>/g)]
  .map(([, slug, id, name]) => ({ slug, id, name: text(name) })).filter((c) => c.slug !== 'custom-categories')
const total = Number(first.match(/"numberOfItems": (\d+)/)?.[1])
if (!pages || !standard.length || !total) throw new Error('Drill-Liste nicht erkannt')
const list = new Map()
for (let p = 1; p <= pages && list.size < LIMIT; p++) {
  const html = p === 1 ? first : await get(`/drills/free?page=${p}`)
  for (const [, id, uuid] of html.matchAll(/data-drill-id="(\d+)"\s+data-drill-uuid="([\w-]+)"/g)) if (list.size < LIMIT) list.set(id, uuid)
}

// 2. Drill pages: title, Description / Key Points / Notes, first diagram, animation or video, category, author, dates.
const drills = []
for (const [id, uuid] of list) {
  const html = await get(`/drill/${uuid}`)
  const section = (name) => text(html.match(new RegExp(`section-title">${name}</h2>\\s*<div class="drill-view-prose">([\\s\\S]*?)</div>\\s*</section>`))?.[1] ?? '')
  const meta = (name) => text(html.match(new RegExp(`<strong>${name}:</strong>([^<]*)`))?.[1] ?? '')
  const category = meta('Category')
  const author = meta('Posted By')
  const [created, modified] = ['Created', 'Last Modified'].map((k) => html.match(new RegExp(`${k}: (\\d{4}-\\d\\d-\\d\\d)`))?.[1])
  // The original file is served as a download (application/octet-stream); the CDN's resized JPEG has a proper image type and half the size.
  const image = (html.match(/<img src="(https:\/\/[^"]+)"[^>]*class="drill-view-diagram"/)?.[1] ?? html.match(/data-media-item="diagrams"[\s\S]*?<img src="(https:\/\/[^"]+)"/)?.[1])
    ?.replace(/^(https:\/\/cdn\.hockeyshare\.com\/[\w-]+\/)[^/]+$/, '$1-/format/jpg/-/preview/1200x900/')
  const animation = html.match(/<source src="(https:\/\/[^"]+)"/)?.[1]
  const video = html.match(/<iframe[^>]+src="(https:\/\/(?:www\.)?(?:youtube(?:-nocookie)?\.com|player\.vimeo\.com)[^"]+)"/)?.[1]
  const keyPoints = section('Key Points').split('\n').map((l) => l.replace(/^([-*•·]|\d+[.)])\s*/, '').trim()).filter(Boolean)
  const source = `${BASE}/drill/${uuid}`
  const categories = sihf(category)
  drills.push({
    id: `hs-${id}`, title: text(html.match(/<h1 class="drill-view-title">([\s\S]*?)<\/h1>/)?.[1] ?? ''),
    description: [section('Description'), section('Notes') && `Notes: ${section('Notes')}`, animation && `Animation: ${animation}`, video && `Video: ${video}`,
      category && `Category: ${category}`, author && `Posted by: ${author}`, `Quelle: HockeyShare (${source})`].filter(Boolean).join('\n\n'),
    keyPoints, categories, ...(categories[0] && { primary: categories[0] }), elements: [],
    offIce: /dryland/i.test(category), draft: true, scene: { rink: 'full', items: [] },
    source, ...(image && { image }), updatedAt: `${modified ?? created ?? '2026-10-01'}T00:00:00.000Z`,
    category, // removed below, only used for the self-check
  })
}

// Self-check: a page without title, category or both text and diagram (or with leftover HTML) means the page layout changed.
// About 20 drills are diagram-only (no Description/Key Points on the page), so empty text alone is allowed.
const bad = drills.filter((d) => !d.title || !d.category || (/^(Animation|Category):/.test(d.description) && !d.keyPoints.length && !d.image) || /<\w/.test(d.description))
if (bad.length) throw new Error(`Unvollständig: ${bad.map((d) => d.source).join(', ')}`)

for (const d of drills) delete d.category
mkdirSync(new URL('../private/', import.meta.url), { recursive: true })
writeFileSync(new URL('../private/hockeyshare.json', import.meta.url), JSON.stringify({ version: 1, drills, collections: oneCollection(drills, [], 'hs-c-all', 'HockeyShare'), sessions: [] }, null, 2))
console.log(`${drills.length} von ${total} Übungen → private/hockeyshare.json`)
