import { describe, it, expect } from 'vitest'
import { parseRoute } from '../src/router.js'

describe('parseRoute', () => {
  it('sends empty hash to aisles', () => {
    expect(parseRoute('')).toEqual({ name: 'aisles', aisleId: null })
  })
  it('maps an aisle to its basket', () => {
    expect(parseRoute('#/aisle/abc')).toEqual({ name: 'basket', aisleId: 'abc' })
  })
  it('maps session and receipt sub-routes', () => {
    expect(parseRoute('#/aisle/abc/session')).toEqual({ name: 'session', aisleId: 'abc' })
    expect(parseRoute('#/aisle/abc/receipt')).toEqual({ name: 'receipt', aisleId: 'abc' })
  })
  it('maps settings', () => {
    expect(parseRoute('#/settings').name).toBe('settings')
  })
  it('falls back to aisles for unknown routes', () => {
    expect(parseRoute('#/nope').name).toBe('aisles')
  })
})
