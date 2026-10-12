import type { Item, Pt, Scene } from './types'

export const uid = () => crypto.randomUUID()
export const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1])
export const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
const add = (a: Pt, d: Pt): Pt => [a[0] + d[0], a[1] + d[1]]

export function moveItem(item: Item, d: Pt): Item {
  switch (item.kind) {
    case 'route':
      return { ...item, from: add(item.from, d), to: add(item.to, d), ctrl: item.ctrl && add(item.ctrl, d), via: item.via?.map((p) => add(p, d)) }
    case 'free':
      return { ...item, pts: item.pts.map((p) => add(p, d)) }
    default:
      return { ...item, at: add(item.at, d) }
  }
}

// A hand-drawn route whose points stay within 5% of its length from the straight line (a few degrees)
// becomes straight. The editor commits this as its own undo step.
export function straighten(item: Item): Item {
  if (item.kind !== 'route' || !item.via) return item
  const { from, to, via } = item
  const len = dist(from, to)
  const off = (p: Pt) => Math.abs((to[0] - from[0]) * (p[1] - from[1]) - (to[1] - from[1]) * (p[0] - from[0])) / len
  return len && via.every((p) => off(p) <= 0.05 * len) ? { ...item, via: undefined } : item
}

export const addItem = (s: Scene, item: Item): Scene => ({ ...s, items: [...s.items, item] })
export const removeItem = (s: Scene, id: string): Scene => ({ ...s, items: s.items.filter((it) => it.id !== id) })
export const updateItem = (s: Scene, id: string, fn: (it: Item) => Item): Scene => ({
  ...s,
  items: s.items.map((it) => (it.id === id ? fn(it) : it)),
})

// Undo/redo keeps whole scenes; the editor commits once per finished gesture, not per pointer sample.
export type History<T = Scene> = { past: T[]; present: T; future: T[] }
export const initHistory = <T>(present: T): History<T> => ({ past: [], present, future: [] })
export const commit = <T>(h: History<T>, s: T): History<T> =>
  s === h.present ? h : { past: [...h.past, h.present], present: s, future: [] }
export const undo = <T>(h: History<T>): History<T> =>
  h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h
export const redo = <T>(h: History<T>): History<T> =>
  h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h
