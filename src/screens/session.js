import * as db from '../db.js'
import { el, toast, sheet, showBanner, hideBanner, urlBag } from '../ui.js'
import { go } from '../router.js'
import { runNudges, unlockAudio, playChime } from '../nudge.js'
import { startCamera, openMic, stopStream, grabPhoto, startRecording } from '../media.js'
import { startTranscribe } from '../speech.js'

const HOLD_MS = 300

// Tap vs. press-and-hold on one button.
function holdable(node, { onTap, onHoldStart, onHoldEnd }) {
  let timer = null
  let holding = false
  const down = (e) => {
    e.preventDefault()
    try { node.setPointerCapture?.(e.pointerId) } catch { /* synthetic or ended pointer */ }
    holding = false
    timer = setTimeout(() => { holding = true; onHoldStart() }, HOLD_MS)
  }
  const up = () => {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
    if (holding) onHoldEnd()
    else onTap()
    holding = false
  }
  node.addEventListener('pointerdown', down)
  node.addEventListener('pointerup', up)
  node.addEventListener('pointercancel', up)
  node.addEventListener('contextmenu', (e) => e.preventDefault())
}

const fmtElapsed = (ms) => {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export async function renderSession(root, { aisleId }) {
  const aisle = await db.getAisle(aisleId)
  if (!aisle) return go('#/')
  const settings = await db.getSettings()
  const urls = urlBag()
  const startedAt = Date.now()
  let mode = aisle.lastMode === 'screen' ? 'screen' : 'hands-on'
  let cameraStream = null
  let micStream = null
  let recording = null // { rec, kind, stopSpeech? }
  let wakeLock = null
  let closed = false

  // ---------- shared pieces ----------

  const elapsed = el('span', { class: 'muted' }, '0:00')
  const thumbs = el('div', { class: 'strip-thumbs' })
  const body = el('div', { style: { flex: '1', display: 'flex', flexDirection: 'column', minHeight: '0' } })

  const nudges = runNudges({
    intervalMs: settings.nudgeMinutes * 60_000,
    onNudge: () => {
      playChime()
      showBanner(mode === 'screen' ? 'SCREENSHOT IT!' : 'SNAP IT!')
    },
  })

  const clock = setInterval(() => { elapsed.textContent = fmtElapsed(Date.now() - startedAt) }, 1000)

  function addThumb(blob, kind) {
    const node = kind.startsWith('image') || kind === 'photo' || kind === 'import'
      ? el('img', { src: urls.url(blob), alt: '' })
      : el('div', { class: 'vthumb', style: { display: 'grid', placeItems: 'center', color: '#fff' } }, kind === 'video' ? '▶' : '🎙')
    thumbs.prepend(node)
  }

  function captured() {
    nudges.reset()
    hideBanner()
  }

  async function save(fn) {
    try {
      return await fn()
    } catch (err) {
      if (err instanceof db.QuotaError) {
        toast("Couldn't save, your phone storage is full. Export and delete an old aisle.", 'error')
      } else {
        console.error(err)
        toast(`Couldn't save: ${err.message || err}`, 'error')
      }
      return null
    }
  }

  async function saveCapture(kind, blob) {
    const cap = await save(() => db.addCapture({ aisleId, kind, blob, mime: blob.type }))
    if (cap) { addThumb(blob, kind); captured() }
  }

  async function ensureMic() {
    if (micStream?.active) return micStream
    micStream = await openMic()
    return micStream
  }

  // ---------- voice / text notes ----------

  async function startVoiceNote(button) {
    if (recording) return
    try {
      const mic = await ensureMic()
      const rec = startRecording(mic.getAudioTracks(), 'audio')
      const stopSpeech = startTranscribe()
      recording = { rec, kind: 'audio', stopSpeech, button }
      button.classList.add('recording')
    } catch (err) {
      micDenied(err)
    }
  }

  async function finishRecording() {
    if (!recording) return
    const { rec, kind, stopSpeech, button } = recording
    recording = null
    button?.classList.remove('recording')
    recDot.classList.remove('on')
    const [blob, text] = await Promise.all([rec.stopAndSave(), stopSpeech ? stopSpeech() : Promise.resolve('')])
    if (!blob.size) return toast('Too short, hold a little longer.', 'warn')
    if (kind === 'audio') {
      const note = await save(() => db.addNote({ aisleId, text, audioBlob: blob, audioMime: blob.type }))
      if (note) {
        addThumb(blob, 'audio')
        captured()
        toast(text ? `🎙 “${text.slice(0, 60)}${text.length > 60 ? '…' : ''}”` : '🎙 Voice note saved')
      }
    } else {
      await saveCapture('video', blob)
    }
  }

  async function textNote() {
    const text = await sheet((close) => {
      const ta = el('textarea', { class: 'field', placeholder: 'Why this color? What changed? What went wrong?' })
      setTimeout(() => ta.focus(), 50)
      return [
        el('p', { class: 'sheet-msg' }, 'Quick note'),
        ta,
        el('div', { class: 'sheet-actions' },
          el('button', { class: 'btn btn-ghost', onclick: () => close(null) }, 'Cancel'),
          el('button', { class: 'btn btn-blue', onclick: () => close(ta.value.trim()) }, 'Save note'),
        ),
      ]
    })
    if (!text) return
    const note = await save(() => db.addNote({ aisleId, text }))
    if (note) { captured(); toast('✏️ Note saved') }
  }

  function micDenied(err) {
    console.warn(err)
    toast('Microphone is off for Mini Mart. Turn it on in Settings → Safari → Microphone.', 'error')
  }

  // ---------- hands-on mode ----------

  const video = el('video', { autoplay: true, muted: true, playsinline: true })
  const flash = el('div', { class: 'cam-flash' })
  const recDot = el('div', { class: 'rec-dot' }, '● REC')

  function cameraOffCard(err) {
    console.warn(err)
    return el('div', { class: 'cam-off' },
      el('p', { style: { fontSize: '17px', margin: 0 } }, 'Camera is off for Mini Mart Studio.'),
      el('p', { style: { margin: 0, opacity: 0.8 } }, 'Turn it on in Settings → Safari → Camera, then come back.'),
      el('button', { class: 'btn btn-ghost', onclick: () => setMode('screen') }, '💻 Use Screen mode'),
    )
  }

  function handsOn() {
    const camWrap = el('div', { class: 'cam-wrap' }, video, flash, recDot)
    const shutter = el('button', { class: 'shutter', 'aria-label': 'Tap for photo, hold for video' })
    const mic = el('button', { class: 'round', 'aria-label': 'Hold for voice note, tap for text note' }, '🎙')
    const notePad = el('button', { class: 'round', 'aria-label': 'Text note', onclick: textNote }, '✏️')

    holdable(shutter, {
      onTap: async () => {
        try {
          const blob = await grabPhoto(video)
          flash.classList.add('on')
          setTimeout(() => flash.classList.remove('on'), 30)
          await saveCapture('photo', blob)
        } catch (err) {
          toast(err.message, 'warn')
        }
      },
      onHoldStart: async () => {
        if (!cameraStream || recording) return
        let tracks = cameraStream.getVideoTracks()
        try {
          tracks = [...tracks, ...(await ensureMic()).getAudioTracks()]
        } catch { /* no mic: record silent video */ }
        recording = { rec: startRecording(tracks, 'video'), kind: 'video', button: shutter }
        shutter.classList.add('recording')
        recDot.classList.add('on')
      },
      onHoldEnd: finishRecording,
    })
    holdable(mic, { onTap: textNote, onHoldStart: () => startVoiceNote(mic), onHoldEnd: finishRecording })

    startCamera(video)
      .then((s) => {
        if (closed || mode !== 'hands-on') return stopStream(s)
        cameraStream = s
      })
      .catch((err) => camWrap.replaceChildren(cameraOffCard(err)))

    return [
      camWrap,
      el('div', { class: 'checker' }),
      thumbs,
      el('div', { class: 'shutter-bar' }, notePad, shutter, mic),
      el('div', { class: 'hints' }, el('span', {}, 'text note'), el('span', {}, 'tap = photo · hold = video'), el('span', {}, 'hold = voice note')),
    ]
  }

  // ---------- screen mode ----------

  function screenMode() {
    const picker = el('input', { type: 'file', accept: 'image/*,video/*', multiple: true, style: { display: 'none' } })
    picker.addEventListener('change', async () => {
      const files = [...picker.files]
      picker.value = ''
      for (const f of files) await saveCapture('import', f)
      if (files.length) toast(`Added ${files.length} to the basket`)
    })
    const noteBtn = el('button', { class: 'btn btn-blue' }, '🎙 Add a note')
    holdable(noteBtn, { onTap: textNote, onHoldStart: () => startVoiceNote(noteBtn), onHoldEnd: finishRecording })

    return [
      el('div', { class: 'screen-mode' },
        el('button', { class: 'add-big', onclick: () => picker.click() },
          el('span', { class: 'plus' }, '+'),
          el('b', {}, 'Add from phone'),
          el('span', { class: 'muted' }, 'Pick the screenshots you AirDropped from your Mac'),
        ),
        picker,
        el('div', { class: 'tip' }, '💡 ⌘⇧4 on the Mac → AirDrop → tap +'),
        el('p', { class: 'label', style: { margin: '4px 0 0' } }, 'ADDED THIS SESSION'),
        thumbs,
        noteBtn,
        el('p', { class: 'muted', style: { textAlign: 'center', margin: 0 } }, 'tap to type · hold to talk'),
      ),
    ]
  }

  // ---------- mode switching ----------

  const segHands = el('button', { onclick: () => setMode('hands-on') }, '✋ Hands-on')
  const segScreen = el('button', { onclick: () => setMode('screen') }, '💻 Screen')

  async function setMode(next) {
    if (recording) await finishRecording()
    mode = next
    segHands.classList.toggle('on', mode === 'hands-on')
    segScreen.classList.toggle('on', mode === 'screen')
    stopStream(cameraStream)
    cameraStream = null
    thumbs.remove()
    body.replaceChildren(...(mode === 'hands-on' ? handsOn() : screenMode()))
    db.updateAisle(aisleId, { lastMode: mode })
  }

  // ---------- wake lock & backgrounding ----------

  async function keepAwake() {
    try { wakeLock = await navigator.wakeLock?.request('screen') } catch { wakeLock = null }
  }

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      if (recording) finishRecording()
    } else if (!closed) {
      keepAwake()
      if (mode === 'hands-on' && video.srcObject) video.play().catch(() => {})
    }
  }
  document.addEventListener('visibilitychange', onVisibility)
  const unlockOnce = () => unlockAudio()
  root.addEventListener('pointerdown', unlockOnce, { once: true })

  async function closeStore() {
    go(`#/aisle/${aisleId}`)
  }

  root.append(
    el('div', { class: 'session' },
      el('div', { class: 'session-head' },
        el('span', { class: 'name' }, `A${aisle.number} · ${aisle.name}`),
        elapsed,
        el('button', { class: 'close-store', onclick: closeStore }, '■ Close store'),
      ),
      el('div', { class: 'seg' }, segHands, segScreen),
      body,
    ),
  )

  unlockAudio()
  keepAwake()
  await setMode(mode)

  return async function cleanup() {
    closed = true
    if (recording) await finishRecording()
    nudges.stop()
    clearInterval(clock)
    hideBanner()
    stopStream(cameraStream)
    stopStream(micStream)
    try { await wakeLock?.release() } catch { /* already released */ }
    document.removeEventListener('visibilitychange', onVisibility)
    urls.revokeAll()
  }
}
