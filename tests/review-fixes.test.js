import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import * as db from '../src/db.js'
import { startIfStillHeld } from '../src/media.js'
import { packFiles } from '../src/screens/receipt.js'
import { buildBackup } from '../src/exporter.js'

beforeEach(() => db._resetForTests())

describe('startIfStillHeld (finger lifted before the mic opened)', () => {
  it('does not start a recording when the press already ended', async () => {
    let held = true
    const start = vi.fn(() => 'rec')
    const release = vi.fn()
    const p = startIfStillHeld(async () => { held = false; return 'mic' }, start, () => held, release)
    expect(await p).toBe(null)
    expect(start).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledWith('mic')
  })
  it('starts when still held', async () => {
    const start = vi.fn((mic) => `rec:${mic}`)
    expect(await startIfStillHeld(async () => 'mic', start, () => true, () => {})).toBe('rec:mic')
  })
})

describe('packFiles (one bad photo must not block Save)', () => {
  it('crops photos one at a time and falls back to the original on failure', async () => {
    const strip = [
      { id: 'a', kind: 'photo', mime: 'image/jpeg', blob: new Blob(['a'], { type: 'image/jpeg' }) },
      { id: 'b', kind: 'import', mime: 'image/png', blob: new Blob(['b'], { type: 'image/png' }) },
      { id: 'c', kind: 'video', mime: 'video/mp4', blob: new Blob(['c'], { type: 'video/mp4' }) },
    ]
    let running = 0
    let maxRunning = 0
    const crop = async (c) => {
      running++; maxRunning = Math.max(maxRunning, running)
      await new Promise((r) => setTimeout(r, 5))
      running--
      if (c.id === 'b') throw new Error('decode failed')
      return new Blob(['cropped'], { type: 'image/jpeg' })
    }
    const files = await packFiles(strip, crop)
    expect(files.map((f) => f.name)).toEqual(['01-photo.jpg', '02-import.png', '03-video.mp4'])
    expect(files[1].type).toBe('image/png')
    expect(maxRunning).toBe(1)
  })
})

describe('buildBackup (zip is built before the share tap)', () => {
  it('returns a named zip File without sharing', async () => {
    window.JSZip = JSZip
    const a = await db.createAisle("Sara's Mural / v2")
    await db.addNote({ aisleId: a.id, text: 'hello' })
    const share = vi.fn()
    navigator.share = share
    const file = await buildBackup(a.id)
    expect(file.name).toMatch(/^saras-mural-v2-\d{4}-\d{2}-\d{2}\.zip$/)
    expect(share).not.toHaveBeenCalled()
    const zip = await JSZip.loadAsync(await file.arrayBuffer())
    expect(await zip.file('notes.txt').async('string')).toContain('hello')
  })
})

describe('service worker', () => {
  it('bypasses the HTTP cache when installing a new version', () => {
    expect(readFileSync('sw.js', 'utf8')).toMatch(/cache: 'reload'/)
  })
})

describe('chime after the phone was locked', () => {
  it('resumes an interrupted audio context', async () => {
    const resume = vi.fn()
    const node = () => ({ connect: (x) => x, start() {}, stop() {}, gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, frequency: {} })
    class FakeCtx {
      constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {} }
      resume() { resume() }
      createOscillator() { return node() }
      createGain() { return node() }
    }
    window.AudioContext = FakeCtx
    const nudge = await import('../src/nudge.js')
    nudge.unlockAudio()
    nudge._audioCtxForTests().state = 'interrupted'
    nudge.playChime()
    expect(resume).toHaveBeenCalled()
  })
})
