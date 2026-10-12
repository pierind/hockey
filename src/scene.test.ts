import { expect, test } from 'vitest'
import { commit, initHistory, moveItem, redo, straighten, undo } from './scene'
import type { Scene } from './types'

test('moveItem shifts every point of an item', () => {
  expect(moveItem({ id: 'r', kind: 'route', style: 'pass', from: [1, 1], to: [5, 1], ctrl: [3, 3] }, [1, 2])).toEqual({
    id: 'r', kind: 'route', style: 'pass', from: [2, 3], to: [6, 3], ctrl: [4, 5],
  })
  expect(moveItem({ id: 'f', kind: 'free', pts: [[0, 0], [1, 1]] }, [1, 0])).toEqual({ id: 'f', kind: 'free', pts: [[1, 0], [2, 1]] })
  expect(moveItem({ id: 'p', kind: 'puck', at: [3, 3] }, [-1, -1])).toEqual({ id: 'p', kind: 'puck', at: [2, 2] })
})

test('undo/redo restores whole committed scenes and a new commit clears redo', () => {
  const [a, b, c, d]: Scene[] = [0, 1, 2, 3].map((n) => ({ rink: 'full', items: [{ id: `${n}`, kind: 'puck', at: [n, n] }] }))
  let h = commit(commit(initHistory(a), b), c)
  h = undo(h)
  expect(h.present).toBe(b)
  expect(redo(h).present).toBe(c)
  h = commit(undo(h), d)
  expect(h.present).toBe(d)
  expect(h.future).toEqual([])
  expect(undo(h).present).toBe(a)
  expect(commit(h, h.present)).toBe(h)
})

test('straighten only straightens hand-drawn routes that are nearly straight', () => {
  const route = (via: [number, number][]) => ({ id: 'r', kind: 'route' as const, style: 'forward' as const, from: [0, 0] as [number, number], to: [10, 0] as [number, number], via })
  const wobbly = route([[3, 0.2], [6, -0.4], [8, 0.1]])
  expect(straighten(wobbly)).toEqual({ ...wobbly, via: undefined })
  const curved = route([[3, 2], [6, 2.5], [8, 1]])
  expect(straighten(curved)).toBe(curved)
  const puck = { id: 'p', kind: 'puck' as const, at: [1, 1] as [number, number] }
  expect(straighten(puck)).toBe(puck)
})
