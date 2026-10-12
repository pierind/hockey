import { expect, test } from 'vitest'
import { categories, elements } from './sihf'

test('reads all nine Erscheinungsformen with their exact labels', () => {
  expect(categories.map((c) => c.id)).toEqual(['EF01', 'EF02', 'EF03', 'EF04', 'EF05', 'EF06', 'EF07', 'EF08', 'EF09'])
  expect(categories[8].label).toBe('Geschickt und fair Zweikämpfe bestreiten')
})

test('reads the element catalogue only, keeping the source mapping', () => {
  expect(elements).toHaveLength(55)
  expect(elements.find((e) => e.id === 'U06')?.category).toBe('EF08') // defensive element kept under EF08, as in the source
  expect(elements.find((e) => e.id === 'D17')?.label).toMatch(/\(auch sliding$/) // truncated in the source, not completed
  expect(elements.some((e) => /^[OV]\d\d$/.test(e.id))).toBe(false) // off-ice and personality goals are separate dimensions
})
