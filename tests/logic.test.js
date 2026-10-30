import { describe, it, expect } from 'vitest'
import {
  storageLevel, clampNudgeMinutes, groupByDay, receiptStrip, moveInOrder, removeFromOrder, insertSnippet,
} from '../src/logic.js'

describe('storageLevel', () => {
  it('warns above 90% used', () => {
    expect(storageLevel(91, 100)).toBe('warn')
    expect(storageLevel(90, 100)).toBe('ok')
  })
  it('is ok when quota is unknown', () => {
    expect(storageLevel(5, 0)).toBe('ok')
    expect(storageLevel(5, undefined)).toBe('ok')
  })
})

describe('clampNudgeMinutes', () => {
  it('keeps the interval between 5 and 30 whole minutes', () => {
    expect(clampNudgeMinutes(2)).toBe(5)
    expect(clampNudgeMinutes(45)).toBe(30)
    expect(clampNudgeMinutes(12.6)).toBe(13)
    expect(clampNudgeMinutes('15')).toBe(15)
  })
  it('defaults to 10 for junk', () => {
    expect(clampNudgeMinutes(NaN)).toBe(10)
    expect(clampNudgeMinutes('')).toBe(10)
  })
})

describe('groupByDay', () => {
  const at = (d, h) => new Date(2026, 9, d, h).getTime()
  it('groups newest day first with items oldest first inside a day', () => {
    const caps = [
      { id: 'b', createdAt: at(30, 11) },
      { id: 'old', createdAt: at(28, 9) },
      { id: 'a', createdAt: at(30, 10) },
    ]
    const notes = [{ id: 'n', createdAt: at(28, 10) }]
    const groups = groupByDay(caps, notes)
    expect(groups.map((g) => g.day)).toEqual(['2026-10-30', '2026-10-28'])
    expect(groups[0].captures.map((c) => c.id)).toEqual(['a', 'b'])
    expect(groups[0].notes).toEqual([])
    expect(groups[1].notes.length).toBe(1)
  })
  it('makes a group for a day that only has notes', () => {
    const groups = groupByDay([], [{ id: 'n', createdAt: at(29, 8) }])
    expect(groups).toEqual([{ day: '2026-10-29', captures: [], notes: [{ id: 'n', createdAt: at(29, 8) }] }])
  })
})

describe('receipt ordering', () => {
  const c = (id, extra) => ({ id, starred: true, receiptOrder: null, createdAt: 0, ...extra })

  it('lists ordered starred first, then unordered starred by time, skipping unstarred and dropped', () => {
    const caps = [
      c('late', { createdAt: 5 }),
      c('second', { receiptOrder: 1 }),
      c('unstarred', { starred: false }),
      c('first', { receiptOrder: 0 }),
      c('dropped', { receiptOrder: -1 }),
      c('early', { createdAt: 2 }),
    ]
    expect(receiptStrip(caps).map((x) => x.id)).toEqual(['first', 'second', 'early', 'late'])
  })

  it('moves an item and renumbers 0..n-1', () => {
    const strip = [c('a'), c('b'), c('c')]
    expect(moveInOrder(strip, 0, 2)).toEqual([
      { id: 'b', receiptOrder: 0 }, { id: 'c', receiptOrder: 1 }, { id: 'a', receiptOrder: 2 },
    ])
  })

  it('removing the middle item closes the gap and marks it dropped', () => {
    const strip = [c('a'), c('b'), c('c')]
    expect(removeFromOrder(strip, 'b')).toEqual([
      { id: 'a', receiptOrder: 0 }, { id: 'c', receiptOrder: 1 }, { id: 'b', receiptOrder: -1 },
    ])
  })
})

describe('insertSnippet', () => {
  it('adds a space before the snippet when needed', () => {
    expect(insertSnippet('love this', 9, '#wip')).toEqual({ text: 'love this #wip', cursor: 14 })
  })
  it('does not double the space', () => {
    expect(insertSnippet('love this ', 10, '#wip')).toEqual({ text: 'love this #wip', cursor: 14 })
  })
  it('inserts at the cursor and spaces both sides in the middle of text', () => {
    expect(insertSnippet('ab cd', 2, 'X')).toEqual({ text: 'ab X cd', cursor: 4 })
  })
  it('inserts into an empty caption without a leading space', () => {
    expect(insertSnippet('', 0, '#wip')).toEqual({ text: '#wip', cursor: 4 })
  })
  it('keeps a snippet on its own line after a newline', () => {
    expect(insertSnippet('hi\n', 3, '#wip')).toEqual({ text: 'hi\n#wip', cursor: 7 })
  })
})
