// Nudges: a pure timer (testable) plus the chime and the 1 s loop that drives it.

export function createNudger({ intervalMs, now = Date.now }) {
  let due = null

  return {
    start() { due = now() + intervalMs },
    reset() { if (due !== null) due = now() + intervalMs },
    stop() { due = null },
    // True when a nudge is due. The next one is scheduled from *now*, so a long
    // gap (phone locked, app in background) produces one nudge, not a burst.
    tick() {
      if (due === null || now() < due) return false
      due = now() + intervalMs
      return true
    },
  }
}

let audioCtx = null

// Must be called from a user tap (iOS only allows audio after a gesture).
export function unlockAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return
  if (!audioCtx) audioCtx = new Ctx()
  if (audioCtx.state !== 'running') audioCtx.resume()
  // A silent blip actually unlocks output on iOS.
  const o = audioCtx.createOscillator()
  const g = audioCtx.createGain()
  g.gain.value = 0
  o.connect(g).connect(audioCtx.destination)
  o.start()
  o.stop(audioCtx.currentTime + 0.01)
}

// Two-note "ding-ding" like a shop door bell.
export function playChime() {
  if (!audioCtx) return
  if (audioCtx.state !== 'running') audioCtx.resume()
  const t0 = audioCtx.currentTime
  ;[[880, 0], [1320, 0.14]].forEach(([freq, offset]) => {
    const o = audioCtx.createOscillator()
    const g = audioCtx.createGain()
    o.type = 'sine'
    o.frequency.value = freq
    g.gain.setValueAtTime(0.0001, t0 + offset)
    g.gain.exponentialRampToValueAtTime(0.5, t0 + offset + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.12 + 0.25)
    o.connect(g).connect(audioCtx.destination)
    o.start(t0 + offset)
    o.stop(t0 + offset + 0.4)
  })
}

export function _audioCtxForTests() {
  return audioCtx
}

// Returns { reset, stop }.
export function runNudges({ intervalMs, onNudge }) {
  const nudger = createNudger({ intervalMs })
  nudger.start()
  const check = () => { if (nudger.tick()) onNudge() }
  const onVisible = () => { if (document.visibilityState === 'visible') check() }
  const timer = setInterval(check, 1000)
  document.addEventListener('visibilitychange', onVisible)
  return {
    reset: () => nudger.reset(),
    stop() {
      nudger.stop()
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    },
  }
}
