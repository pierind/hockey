import source from '../docs/reference/sihf-u12-development-plan.md?raw'

// The reference markdown is the single source for categories; it is kept whole for the later season planner.
export type Category = { id: string; label: string }
export type Element = { id: string; category: string; label: string; goal: string }

export function parse(md: string) {
  const categories: Category[] = []
  const elements: Element[] = []
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
    }
  }
  return { categories, elements }
}

export const { categories, elements } = parse(source)
export const categoryLabel: Record<string, string> = Object.fromEntries(categories.map((c) => [c.id, c.label]))
export const elementById: Record<string, Element> = Object.fromEntries(elements.map((e) => [e.id, e]))
