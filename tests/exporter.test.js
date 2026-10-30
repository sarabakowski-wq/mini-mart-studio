import { describe, it, expect } from 'vitest'
import { slugify, buildNotesTxt, mediaFilename, extFor, dateStamp } from '../src/exporter.js'

describe('slugify', () => {
  it('makes a readable filename from emoji, slashes and spaces', () => {
    expect(slugify('Floor mural 🎨 / v2')).toBe('floor-mural-v2')
  })
  it('falls back to "aisle" when nothing is left', () => {
    expect(slugify('🎨🎨')).toBe('aisle')
    expect(slugify('   ')).toBe('aisle')
  })
  it("keeps apostrophes out", () => {
    expect(slugify("Sara's Labels")).toBe('saras-labels')
  })
})

describe('mediaFilename', () => {
  it('zero-pads the position and picks the extension from mime', () => {
    expect(mediaFilename({ kind: 'video', mime: 'video/mp4' }, 2)).toBe('03-video.mp4')
    expect(mediaFilename({ kind: 'photo', mime: 'image/jpeg' }, 0)).toBe('01-photo.jpg')
    expect(mediaFilename({ kind: 'import', mime: 'image/png' }, 10)).toBe('11-import.png')
  })
  it('maps recorder mimes with codecs', () => {
    expect(extFor('video/webm;codecs=vp9')).toBe('webm')
    expect(extFor('audio/mp4')).toBe('m4a')
    expect(extFor('image/heic')).toBe('heic')
  })
})

describe('buildNotesTxt', () => {
  it('lists notes with timestamps, then the caption draft', () => {
    const t1 = new Date(2026, 9, 28, 14, 5).getTime()
    const t2 = new Date(2026, 9, 30, 9, 30).getTime()
    const txt = buildNotesTxt({
      aisle: { number: 2, name: 'Floor mural' },
      notes: [
        { text: 'first sketch, swirl too tight', createdAt: t1, audioBlob: null },
        { text: '', createdAt: t2, audioBlob: {} },
      ],
      caption: 'hi',
    })
    expect(txt).toBe(
      'Aisle A2 · Floor mural\n\n' +
      '2026-10-28 14:05  first sketch, swirl too tight\n' +
      '2026-10-30 09:30  (voice note, no text)\n' +
      '\nCAPTION DRAFT\nhi\n',
    )
  })
})

describe('dateStamp', () => {
  it('formats local date as YYYY-MM-DD', () => {
    expect(dateStamp(new Date(2026, 0, 5).getTime())).toBe('2026-01-05')
  })
})
