import { describe, it, expect } from 'vitest'
import { createNudger } from '../src/nudge.js'

const MIN = 60_000

function setup() {
  let t = 0
  const clock = { now: () => t, set: (m) => { t = m * MIN } }
  const n = createNudger({ intervalMs: 10 * MIN, now: clock.now })
  n.start()
  return { n, clock }
}

describe('createNudger', () => {
  it('does not fire before the interval', () => {
    const { n, clock } = setup()
    clock.set(9.9)
    expect(n.tick()).toBe(false)
  })

  it('fires at the interval and again one interval later', () => {
    const { n, clock } = setup()
    clock.set(10)
    expect(n.tick()).toBe(true)
    expect(n.tick()).toBe(false)
    clock.set(20)
    expect(n.tick()).toBe(true)
  })

  it('reset pushes the next nudge a full interval out', () => {
    const { n, clock } = setup()
    clock.set(9)
    n.reset()
    clock.set(10)
    expect(n.tick()).toBe(false)
    clock.set(19)
    expect(n.tick()).toBe(true)
  })

  it('fires only once after a long gap (phone locked)', () => {
    const { n, clock } = setup()
    clock.set(45)
    expect(n.tick()).toBe(true)
    expect(n.tick()).toBe(false)
    clock.set(54.9)
    expect(n.tick()).toBe(false)
    clock.set(55)
    expect(n.tick()).toBe(true)
  })

  it('never fires when stopped', () => {
    const { n, clock } = setup()
    n.stop()
    clock.set(30)
    expect(n.tick()).toBe(false)
  })
})
