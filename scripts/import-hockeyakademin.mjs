// Fetches the public drills (övningar) of hockeyakademin.se (Svenska Ishockeyförbundet + Svenska Spel) into a backup file for «Backup importieren → Hinzufügen».
// Private use only: the output goes to private/ (gitignored) and must never be committed, this repo is public.
// Usage: node scripts/import-hockeyakademin.mjs   → private/hockeyakademin.json (~150 requests, 1 per second)
import { mkdirSync, writeFileSync } from 'node:fs'
import { oneCollection } from './one-collection.mjs'

const SITE = 'https://hockeyakademin.se'
const UA = 'HockeyPlannerPrivateImporter/1.0 (private, non-commercial drill import; 1 req/s)'
// Site «game form» → SIHF Erscheinungsform (only where it clearly matches).
const EF = { skridskoakning: 'EF03', klubbteknik: 'EF05', 'passning-och-mottagning': 'EF06', 'skott-och-malskytte': 'EF07', narkampsspel: 'EF09' }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function get(url) {
  await sleep(1000)
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res
}
// SvelteKit __data.json: each node's data is a flat array whose objects/arrays point at other indices.
async function page(path) {
  const json = await (await get(`${SITE}${path}/__data.json`)).json()
  const a = json.nodes.at(-1).data
  const h = (i) => (i < 0 ? undefined : Array.isArray(a[i]) ? a[i].map(h) : a[i] && typeof a[i] === 'object' ? Object.fromEntries(Object.entries(a[i]).map(([k, v]) => [k, h(v)])) : a[i])
  return h(0)
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '' }
const text = (html) => html
  .replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')
  .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m))
  .replace(/[ \t ]+/g, ' ').trim()
// Content is <p>/<li> blocks with bold headings «Önskade tränarbeteenden», «Spelarbeteenden – …», «Utförande»; Fys drills have only steps.
function sections(html) {
  const s = { intro: [], tranar: [], spelar: [], utforande: [] }
  let cur = 'intro'
  for (const m of html.replace(/<iframe[\s\S]*?<\/iframe>/g, '').matchAll(/<(p|li|h\d)[^>]*>([\s\S]*?)<\/\1>/g)) {
    const t = text(m[2])
    if (/^Önskade tränarbeteenden:?$/i.test(t)) cur = 'tranar'
    else if (/^Spelarbeteenden\b/i.test(t)) cur = 'spelar'
    else if (/^(Utförande|Description):?$/i.test(t)) cur = 'utforande'
    else if (t) s[cur].push(...t.split('\n').map((l) => l.trim()).filter(Boolean))
  }
  return s
}

const sitemap = await (await get(`${SITE}/sitemap.xml`)).text()
const urls = [...sitemap.matchAll(/<loc>(https:\/\/hockeyakademin\.se\/ovningar\/[^<\/]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)]
const drills = []
const missing = []
const groups = new Map() // category slug → { name, drillIds }
for (const [, url, lastmod] of urls) {
  const { post } = await page(new URL(url).pathname)
  const s = sections(post.content ?? '')
  const id = `sha-${post.id}`
  const fys = post.category?.slug !== 'hockeyovningar'
  const categories = [...new Set((post.gameFormCategory ?? []).map((g) => EF[g.slug]).filter(Boolean))]
  const video = String(post.youtube_id ?? '').match(/(?:embed\/|^)([\w-]{11})(?:\?|"|$)/)?.[1]
  const pdf = post.files?.find((f) => f.type === 'pdf')?.url
  const image = post.image?.md?.url // 788×526 rendition
  if (!s.intro.length && !s.utforande.length || !fys && !s.utforande.length) missing.push(url)
  drills.push({
    id, title: text(post.title), description: [...s.intro, ...s.utforande, s.tranar.length && `Tränarbeteenden: ${s.tranar.join(' ')}`,
      video && `Video: https://youtu.be/${video}`, pdf && `Övning PDF: ${encodeURI(pdf)}`, `Quelle: Hockeyakademin (${post.url})`].filter(Boolean).join('\n\n'),
    keyPoints: s.spelar, categories, ...(categories[0] && { primary: categories[0] }), elements: [], offIce: fys, draft: true,
    scene: { rink: 'full', items: [] }, source: post.url, ...(image?.startsWith('https://') && { image }), updatedAt: new Date(lastmod).toISOString(),
  })
  for (const c of [post.category, ...(post.targetGroupCategory ?? []), ...(post.gameFormCategory ?? [])].filter(Boolean)) {
    if (!groups.has(c.slug)) groups.set(c.slug, { name: c.name, drillIds: [] })
    groups.get(c.slug).drillIds.push(id)
  }
  process.stdout.write('.')
}
// Self-check: every drill needs a title and a body, hockey drills the «Utförande» section (NHLCA drills: «Description»).
missing.push(...drills.filter((d) => !d.title).map((d) => d.source))
if (missing.length || drills.length < 100) throw new Error(`Unvollständig (${drills.length} Übungen): ${missing.join(', ')}`)
const collections = [{ id: 'sha-c-all', name: 'Hockeyakademin (alle)', drillIds: drills.map((d) => d.id) },
  ...[...groups].map(([slug, g]) => ({ id: `sha-c-${slug}`, name: `Hockeyakademin: ${g.name}`, drillIds: g.drillIds }))]
mkdirSync(new URL('../private/', import.meta.url), { recursive: true })
writeFileSync(new URL('../private/hockeyakademin.json', import.meta.url), JSON.stringify({ version: 1, drills, collections: oneCollection(drills, collections, 'sha-c-all', 'Hockeyakademin'), sessions: [] }, null, 2))
console.log(`\n${drills.length} Übungen → private/hockeyakademin.json`)
