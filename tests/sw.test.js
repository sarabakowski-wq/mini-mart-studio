import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? walk(p) : [p]
})

describe('service worker cache list', () => {
  it('includes every app file so the app works offline', () => {
    const sw = readFileSync('sw.js', 'utf8')
    const files = [...walk('src'), ...walk('styles'), ...walk('assets'), ...walk('vendor'), 'index.html', 'manifest.webmanifest']
    const missing = files.filter((f) => !sw.includes(`'./${f}'`))
    expect(missing).toEqual([])
  })
})
