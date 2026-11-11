import { expect, test } from 'vitest'
import { categories, elements } from './sihf'

test('reads the eight U12 Erscheinungsformen with their exact labels, plus the goalie one', () => {
  expect(categories.map((c) => c.id)).toEqual(['EF01', 'EF02', 'EF03', 'EF04', 'EF05', 'EF06', 'EF07', 'EF08', 'EF09']) // «Schlittschuhe steuern» is only a heading in the source, not a category
  expect(categories[7].label).toBe('Geschickt und fair Zweikämpfe bestreiten')
  expect(elements.some((e) => e.category === 'EF09')).toBe(false)
})

test('reads the element catalogue only, keeping the source mapping', () => {
  expect(elements).toHaveLength(54)
  expect(elements.find((e) => e.id === 'U06')?.category).toBe('EF07') // defensive element kept under EF07, as in the source
  expect(elements.find((e) => e.id === 'D17')?.label).toMatch(/\(auch sliding$/) // truncated in the source, not completed
  expect(elements.some((e) => /^[OV]\d\d$/.test(e.id))).toBe(false) // off-ice and personality goals are separate dimensions
})
