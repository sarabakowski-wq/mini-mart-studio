import { describe, it, expect } from 'vitest'
import { cropRect } from '../src/crop.js'

describe('cropRect', () => {
  it('center-crops a landscape photo to 4:5', () => {
    expect(cropRect(4000, 3000)).toEqual({ sx: 800, sy: 0, sw: 2400, sh: 3000 })
  })
  it('center-crops a tall photo to 4:5', () => {
    expect(cropRect(1080, 1920)).toEqual({ sx: 0, sy: 285, sw: 1080, sh: 1350 })
  })
  it('leaves an exact 4:5 image whole', () => {
    expect(cropRect(1080, 1350)).toEqual({ sx: 0, sy: 0, sw: 1080, sh: 1350 })
  })
})
