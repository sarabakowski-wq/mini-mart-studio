import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as db from '../src/db.js'
// jsdom's Blob can't be structured-cloned into fake-indexeddb; Node's real Blob can.
import { Blob as NodeBlob } from 'node:buffer'

const blob = () => new Blob(['x'], { type: 'image/jpeg' })

beforeEach(async () => {
  await db._resetForTests()
})

describe('aisles', () => {
  it('numbers aisles sequentially, counting archived ones', async () => {
    const a1 = await db.createAisle('Candle labels')
    const a2 = await db.createAisle('Floor mural')
    await db.updateAisle(a2.id, { archived: true })
    const a3 = await db.createAisle('Logo refresh')
    expect([a1.number, a2.number, a3.number]).toEqual([1, 2, 3])
    expect(a1).toMatchObject({ archived: false, checkedOut: false, lastMode: 'hands-on' })
  })

  it('lists only non-archived aisles by default, newest activity first', async () => {
    const a = await db.createAisle('A')
    const b = await db.createAisle('B')
    const c = await db.createAisle('C')
    await db.updateAisle(c.id, { archived: true })
    await db.addCapture({ aisleId: a.id, kind: 'photo', blob: blob(), mime: 'image/jpeg' })
    const names = (await db.listAisles()).map((x) => x.name)
    expect(names).toEqual(['A', 'B'])
    expect((await db.listAisles({ archived: true })).map((x) => x.name)).toEqual(['C'])
    expect(b.id).toBeTruthy()
  })
})

describe('captures and notes', () => {
  it('bumps the aisle updatedAt when a capture is added', async () => {
    const a = await db.createAisle('A')
    await new Promise((r) => setTimeout(r, 5))
    const cap = await db.addCapture({ aisleId: a.id, kind: 'photo', blob: blob(), mime: 'image/jpeg' })
    expect(cap).toMatchObject({ starred: false, receiptOrder: null, kind: 'photo' })
    expect((await db.getAisle(a.id)).updatedAt).toBeGreaterThan(a.updatedAt)
  })

  it('deleting a capture removes notes linked to it', async () => {
    const a = await db.createAisle('A')
    const cap = await db.addCapture({ aisleId: a.id, kind: 'photo', blob: blob(), mime: 'image/jpeg' })
    await db.addNote({ aisleId: a.id, captureId: cap.id, text: 'linked' })
    await db.addNote({ aisleId: a.id, text: 'loose' })
    await db.deleteCapture(cap.id)
    expect(await db.listCaptures(a.id)).toEqual([])
    expect((await db.listNotes(a.id)).map((n) => n.text)).toEqual(['loose'])
  })

  it('lists notes oldest first', async () => {
    const a = await db.createAisle('A')
    await db.addNote({ aisleId: a.id, text: 'first' })
    await new Promise((r) => setTimeout(r, 3))
    await db.addNote({ aisleId: a.id, text: 'second' })
    expect((await db.listNotes(a.id)).map((n) => n.text)).toEqual(['first', 'second'])
  })

  it('stores and reads back blobs', async () => {
    const a = await db.createAisle('A')
    await db.addCapture({ aisleId: a.id, kind: 'import', blob: new NodeBlob(['hello'], { type: 'image/png' }), mime: 'image/png' })
    const [cap] = await db.listCaptures(a.id)
    expect(cap.blob.size).toBe(5)
  })
})

describe('drafts and settings', () => {
  it('round-trips a caption draft, default empty', async () => {
    const a = await db.createAisle('A')
    expect(await db.getDraft(a.id)).toBe('')
    await db.saveDraft(a.id, 'hello world')
    expect(await db.getDraft(a.id)).toBe('hello world')
  })

  it('returns default settings and merges saved patches', async () => {
    expect(await db.getSettings()).toEqual({ nudgeMinutes: 10, snippets: [], persistNoticeShown: false })
    await db.saveSettings({ nudgeMinutes: 15 })
    expect(await db.getSettings()).toMatchObject({ nudgeMinutes: 15, snippets: [] })
  })
})

describe('storage full', () => {
  it('rethrows QuotaExceededError as QuotaError', async () => {
    const a = await db.createAisle('A')
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    await expect(db.addCapture({ aisleId: a.id, kind: 'photo', blob: blob(), mime: 'image/jpeg' }))
      .rejects.toBeInstanceOf(db.QuotaError)
    spy.mockRestore()
  })
})

describe('deleteAisle', () => {
  it('removes the aisle with its captures, notes and draft', async () => {
    const a = await db.createAisle('A')
    const keep = await db.createAisle('Keep')
    await db.addCapture({ aisleId: a.id, kind: 'photo', blob: blob(), mime: 'image/jpeg' })
    await db.addNote({ aisleId: a.id, text: 'n' })
    await db.saveDraft(a.id, 'cap')
    await db.deleteAisle(a.id)
    expect(await db.getAisle(a.id)).toBeUndefined()
    expect(await db.listCaptures(a.id)).toEqual([])
    expect(await db.listNotes(a.id)).toEqual([])
    expect(await db.getDraft(a.id)).toBe('')
    expect((await db.listAisles()).map((x) => x.id)).toEqual([keep.id])
  })
})
