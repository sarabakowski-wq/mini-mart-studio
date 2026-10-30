import { describe, it, expect, beforeEach } from 'vitest'
import * as db from '../src/db.js'
import { deleteCaptureKeepingOrder } from '../src/screens/basket.js'
import { receiptStrip } from '../src/logic.js'

beforeEach(() => db._resetForTests())

describe('deleteCaptureKeepingOrder', () => {
  it('closes the gap in the receipt strip when a placed capture is deleted', async () => {
    const a = await db.createAisle('A')
    const caps = []
    for (let i = 0; i < 3; i++) {
      const c = await db.addCapture({ aisleId: a.id, kind: 'photo', blob: new Blob(['x']), mime: 'image/jpeg' })
      caps.push(await db.updateCapture(c.id, { starred: true, receiptOrder: i }))
    }
    await deleteCaptureKeepingOrder(a.id, caps[1])
    const strip = receiptStrip(await db.listCaptures(a.id))
    expect(strip.map((c) => [c.id, c.receiptOrder])).toEqual([[caps[0].id, 0], [caps[2].id, 1]])
  })
})
