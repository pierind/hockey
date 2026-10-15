// Fetches the ice hockey drills of mobilesport.ch (BASPO / J+S) into a backup file for «Backup importieren → Hinzufügen».
// Private use only: the output goes to private/ (gitignored) and must never be committed, this repo is public.
// Usage: node scripts/import-mobilesport.mjs   → private/mobilesport.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const API = 'https://www.mobilesport.ch/wp-json/wp/v2/posts?sp=87&per_page=100' // sp 87 = Eishockey, 81 posts (2026-10)
// Articles, overviews and PDF-only lessons: no drill to extract.
const SKIP = /Unihockey|Inline-Skating|Hart, schnell|Spritzigkeit|Monatsthema|vier Säulen|mächtiges Instrument|Die Macht des Spiels$|Methodische Progression|Zeichenerklärung|sportmotorische Konzept|Mentale Stärke|Merkblatt|Intermittierendes|Beweglichkeit|Lektion \d|^Eishockey: Trainingsformen zu den Erscheinungsformen$/
const categories = [...readFileSync(new URL('../docs/reference/sihf-u12-development-plan.md', import.meta.url), 'utf8').matchAll(/^\| (EF\d\d) \| (.+?) \|$/gm)]
  .map(([, id, label]) => ({ id, label: label.toLowerCase() }))

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '' }
export const text = (html) => html
  .replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')
  .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m))
  .replace(/[ \t ]+/g, ' ').trim()
const all = (re, html) => [...html.matchAll(re)].map((m) => text(m[1])).filter(Boolean)
const items = (html) => all(/<li[^>]*>([\s\S]*?)<\/li>/g, html)
// The first diagram, at a moderate size from srcset (full-size PNGs are several MB).
function image(html) {
  const img = html.match(/<img [^>]*>/)?.[0]
  if (!img) return undefined
  const sizes = [...(img.match(/srcset="([^"]+)"/)?.[1] ?? '').matchAll(/(\S+) (\d+)w/g)].map(([, url, w]) => ({ url, w: Number(w) })).sort((a, b) => a.w - b.w)
  const url = (sizes.find((s) => s.w >= 600) ?? sizes.at(-1))?.url ?? img.match(/src="([^"]+)"/)?.[1]
  return url?.startsWith('https://') ? url : undefined
}
const video = (html) => html.match(/youtube\.com\/embed\/([\w-]+)/)?.[1]
const drill = (id, title, d) => ({
  id, title, description: d.description, keyPoints: d.keyPoints ?? [], categories: d.categories ?? [], ...(d.categories?.[0] && { primary: d.categories[0] }),
  elements: [], ...(d.minutes && { minutes: d.minutes }), offIce: false, draft: true, scene: { rink: 'full', items: [] },
  source: d.source, ...(d.image && { image: d.image }), updatedAt: d.updatedAt,
})
const LICENCE = 'Quelle: www.mobilesport.ch (CC BY-NC-SA 4.0)'

// «Trainingsformen zu den Erscheinungsformen»: example trainings per Erscheinungsform, several drills per accordion section.
function trainingsformen(post, group, ef) {
  const cat = categories.find((c) => c.label === ef.toLowerCase())?.id
  const drills = []
  let phase = ''
  let tips = []
  const html = post.content.rendered
  const chunks = html.includes('accordion-header') ? html.split('<div class="accordion-header') : ['', html.slice(html.indexOf('<hr'))]
  chunks.forEach((chunk, i) => {
    const k = chunk.search(/<h2 class="wp-block-heading">Beispieltrainings/)
    const [body, rest] = k < 0 ? [chunk, ''] : [chunk.slice(0, k), chunk.slice(k)]
    if (i > 0) {
      const head = text(chunk.match(/^[^>]*>\s*<h3>([^<]+)<\/h3>/)?.[1] ?? '')
      const pieces = body.split('<h2 class="wp-block-heading">').slice(1)
      const total = Number(head.match(/\((\d+) Minuten\)/)?.[1]) || 0
      for (const piece of pieces) {
        const name = text(piece.slice(0, piece.indexOf('</h2>')))
        const list = (h) => items(piece.match(new RegExp(`${h}</h3>\\s*<ul[^>]*>([\\s\\S]*?)</ul>`))?.[1] ?? '')
        const variants = ['einfacher', 'schwieriger', 'Entwicklungsfragen'].map((h) => list(h).length && `${h[0].toUpperCase()}${h.slice(1)}: ${list(h).join('; ')}`)
        const v = video(piece)
        drills.push(drill(`ms-${post.id}-${drills.length + 1}`, name, {
          description: [...all(/<p[^>]*>([\s\S]*?)<\/p>/g, piece), ...variants, v && `Video: https://youtu.be/${v}`, [group, ef, phase, head].filter(Boolean).join(' · '), LICENCE].filter(Boolean).join('\n\n'),
          keyPoints: list('Teachingpoints').length ? list('Teachingpoints') : tips,
          categories: cat ? [cat] : [],
          minutes: total && Math.round(total / (pieces.length || 1)),
          source: post.link, image: image(piece), updatedAt: post.modified_gmt + 'Z',
        }))
      }
    }
    if (rest) {
      phase = rest.match(/Beispieltrainings (Phase [^<]+)</)?.[1] ?? phase
      tips = items(rest.match(/Expertentipp<\/h3>\s*<ul[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? '')
    }
  })
  return { drills, collection: { id: `ms-c-${post.id}`, name: `mobilesport: ${group} – ${ef}`, drillIds: drills.map((d) => d.id) } }
}

// Single drill posts: lead (h5), diagram, paragraphs, variation, «Bemerkungen» or «Keypoints».
function single(post) {
  const html = post.content.rendered
  const main = html.replace(/<blockquote[\s\S]*?<\/blockquote>/g, '').replace(/<div class="wp-block-group[^"]*"><div class="wp-block-group__inner-container">[\s\S]*?<\/div><\/div>/g, '')
  const keys = [...html.matchAll(/Keypoints[^:<]*:<\/strong>([\s\S]*?)(?=<strong>|<\/td>|<\/div>)/g)].flatMap((m) => text(m[1]).split(/,\s*/)).filter(Boolean)
  const keyPoints = keys.length ? keys : html.includes('Bemerkungen') ? items(html.slice(html.indexOf('Bemerkungen'))) : []
  const variation = [...all(/<blockquote>([\s\S]*?)<\/blockquote>/g, html).map((t) => t.replace(/^Variatione?n?\s*/, '')), ...items(html.match(/Variationen<\/h2>([\s\S]*?)<\/ul>/)?.[1] ?? '')]
  const title = text(post.title.rendered)
  return drill(`ms-${post.id}`, title.slice(title.lastIndexOf(': ') + 2), {
    description: [...all(/<h5[^>]*>([\s\S]*?)<\/h5>/g, main), ...all(/<p[^>]*>([\s\S]*?)<\/p>/g, main).filter((p) => p !== 'Bemerkungen:'),
      variation.length && `Variation: ${variation.join('; ')}`, LICENCE].filter(Boolean).join('\n\n'),
    keyPoints, source: post.link, image: image(html), updatedAt: post.modified_gmt + 'Z',
  })
}

const res = await fetch(API)
if (!res.ok) throw new Error(`mobilesport.ch: HTTP ${res.status}`)
const posts = await res.json()
const drills = []
const collections = []
for (const post of posts) {
  const title = text(post.title.rendered)
  if (!post.link.includes('/eishockey/') || SKIP.test(title)) continue
  const tf = title.match(/^Eishockey (Kinder|Jugendliche) – Trainingsformen zu den Erscheinungsformen: (.+)$/)
  if (tf) {
    const r = trainingsformen(post, tf[1], tf[2])
    drills.push(...r.drills)
    collections.push(r.collection)
  } else drills.push(single(post))
}
const bad = drills.filter((d) => !d.title || !d.description)
if (bad.length) throw new Error(`Unvollständig: ${bad.map((d) => d.id).join(', ')}`)
collections.unshift({ id: 'ms-c-all', name: 'mobilesport.ch (alle)', drillIds: drills.map((d) => d.id) })
mkdirSync(new URL('../private/', import.meta.url), { recursive: true })
writeFileSync(new URL('../private/mobilesport.json', import.meta.url), JSON.stringify({ version: 1, drills, collections, sessions: [] }, null, 2))
console.log(`${drills.length} Übungen, ${collections.length} Sammlungen → private/mobilesport.json`)
