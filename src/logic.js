// Pure helpers used by the screens. No DOM, no storage.
import { dateStamp } from './exporter.js'

export function storageLevel(usage, quota) {
  if (!quota) return 'ok'
  return usage / quota > 0.9 ? 'warn' : 'ok'
}

export function clampNudgeMinutes(n) {
  const v = typeof n === 'string' && n.trim() === '' ? NaN : Number(n)
  if (!Number.isFinite(v)) return 10
  return Math.min(30, Math.max(5, Math.round(v)))
}

// Newest day first; inside a day, oldest first (the order things happened).
export function groupByDay(captures, notes) {
  const days = new Map()
  const bucket = (ts) => {
    const day = dateStamp(ts)
    if (!days.has(day)) days.set(day, { day, captures: [], notes: [] })
    return days.get(day)
  }
  captures.forEach((c) => bucket(c.createdAt).captures.push(c))
  notes.forEach((n) => bucket(n.createdAt).notes.push(n))
  const byTime = (a, b) => a.createdAt - b.createdAt
  return [...days.values()]
    .sort((a, b) => (a.day < b.day ? 1 : -1))
    .map((g) => ({ ...g, captures: g.captures.sort(byTime), notes: g.notes.sort(byTime) }))
}

// receiptOrder: null = starred but not yet placed, 0..n = position, -1 = dropped from this post.
export function receiptStrip(captures) {
  const starred = captures.filter((c) => c.starred && c.receiptOrder !== -1)
  const placed = starred.filter((c) => c.receiptOrder != null).sort((a, b) => a.receiptOrder - b.receiptOrder)
  const unplaced = starred.filter((c) => c.receiptOrder == null).sort((a, b) => a.createdAt - b.createdAt)
  return [...placed, ...unplaced]
}

const renumber = (items) => items.map((c, i) => ({ id: c.id, receiptOrder: i }))

export function moveInOrder(strip, from, to) {
  const items = [...strip]
  const [moved] = items.splice(from, 1)
  items.splice(to, 0, moved)
  return renumber(items)
}

export function removeFromOrder(strip, id) {
  return [...renumber(strip.filter((c) => c.id !== id)), { id, receiptOrder: -1 }]
}

export function insertSnippet(text, cursor, snippet) {
  const before = text.slice(0, cursor)
  const after = text.slice(cursor)
  const lead = before === '' || /\s$/.test(before) ? '' : ' '
  const trail = after === '' || /^\s/.test(after) ? '' : ' '
  const inserted = lead + snippet + trail
  return { text: before + inserted + after, cursor: before.length + lead.length + snippet.length + trail.length }
}
