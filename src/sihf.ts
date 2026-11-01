import source from '../docs/reference/sihf-u12-development-plan.md?raw'

// The reference markdown is the single source for categories and goals; its Jahresablauf seeds the season planner.
export type Category = { id: string; label: string }
export type Element = { id: string; category: string; label: string; goal: string }

export function parse(md: string) {
  const categories: Category[] = []
  const elements: Element[] = []
  const goals: Element[] = [] // O01 (off-ice) and V01..V20 (Persönlichkeit), outside the Erscheinungsformen
  let section = '' // current '##' section
  let ef = '' // current '### EFxx' subsection inside the element catalogue
  for (const line of md.split('\n')) {
    if (line.startsWith('## ')) [section, ef] = [line, '']
    const head = line.match(/^### (EF\d\d) — /)
    if (head) ef = head[1]
    const cells = line.match(/^\| (.+) \|$/)?.[1].split(' | ')
    if (!cells) continue
    if (section === '## Erscheinungsformen' && /^EF\d\d$/.test(cells[0])) {
      categories.push({ id: cells[0], label: cells[1] })
    } else if (ef && /^[A-Z]\d\d$/.test(cells[0])) {
      elements.push({ id: cells[0], category: ef, label: cells[1], goal: cells[2] })
    } else if (/^(## Zusätzliches|## Persönlichkeit)/.test(section) && /^[OV]\d\d$/.test(cells[0])) {
      goals.push({ id: cells[0], category: cells[0][0] === 'O' ? 'off' : 'personality', label: cells[1], goal: cells[2] })
    }
  }
  return { categories, elements, goals }
}

export type SihfWeek = { phase: string; week: number; month: string; special?: string; trainings: string[]; offIce: string[]; personality: string[]; notes?: string; breakAfter?: string }

// Jahresablauf tables: one row per phase week; each listed code is one training with that Schlüsselelement.
export function parsePlan(md: string): SihfWeek[] {
  const weeks: SihfWeek[] = []
  const ids = (cell = '') => cell.split(',').map((x) => x.trim()).filter((x) => /^[A-Z]\d\d$/.test(x))
  let phase = ''
  let camp: SihfWeek | undefined // week whose personality goals are listed per training below its table
  for (const line of md.split('\n')) {
    phase = line.match(/^### Seite \d+ — ([^,]+)/)?.[1] ?? phase
    const pause = line.match(/^Anschliessend: \*\*(.+)\*\*/)
    if (pause && weeks.length) weeks[weeks.length - 1].breakAfter = pause[1]
    const cells = line.match(/^\| (.+) \|$/)?.[1].split(' | ')
    if (!cells || !phase) continue
    if (/^\d+$/.test(cells[1])) {
      const w: SihfWeek = {
        phase, week: Number(cells[1]), month: cells[0], special: cells[2] === '—' ? undefined : cells[2],
        trainings: ids(cells[3]), offIce: cells.length === 6 ? ids(cells[4]) : [], personality: ids(cells[cells.length - 1]),
      }
      weeks.push(w)
      if (!w.personality.length) camp = w
    } else if (camp && /^V\d\d$/.test(cells[1])) {
      camp.personality.push(cells[1])
      camp.notes = [camp.notes, `Persönlichkeit Training ${cells[0]}: ${cells[1]}`].filter(Boolean).join('\n')
    }
  }
  return weeks
}

const parsed = parse(source)
// The goalie Erscheinungsform is not part of the U12 plan; its label is from the SIHF «Manual Eishockey – Jugendliche» (Good Practice, S. 81).
// It has no Schlüsselelemente. EF09 is an editorial id, like the others.
export const categories: Category[] = [...parsed.categories, { id: 'EF09', label: 'Sich als Torhüter/in agil verschieben und zum Puck ausrichten sowie aktiv mitspielen' }]
export const { elements, goals } = parsed
export const sihfPlan = parsePlan(source)
// The source names B01–B04 and H01 as the other accompanying off-ice goals, next to O01.
export const offIceGoals = [...elements.filter((e) => ['B01', 'B02', 'B03', 'B04', 'H01'].includes(e.id)), ...goals.filter((g) => g.category === 'off')]
export const personalityGoals = goals.filter((g) => g.category === 'personality')
export const goalLabel: Record<string, string> = Object.fromEntries([...elements, ...goals].map((g) => [g.id, g.label]))
export const categoryLabel: Record<string, string> = Object.fromEntries(categories.map((c) => [c.id, c.label]))
export const elementById: Record<string, Element> = Object.fromEntries(elements.map((e) => [e.id, e]))
