import * as db from '../db.js'
import { el, toast, confirmSheet, urlBag } from '../ui.js'
import { go } from '../router.js'
import { receiptStrip, moveInOrder, removeFromOrder, insertSnippet } from '../logic.js'
import { cropToJpeg } from '../crop.js'
import { mediaFilename } from '../exporter.js'
import { shareFiles, copyText } from '../share.js'

const isVideo = (c) => c.kind === 'video' || c.mime?.startsWith('video/')
const LONG_PRESS_MS = 250

// Turns the strip into files in order. Photos are cropped one at a time (iPhone canvas
// memory is tight); if a crop fails, the original goes out instead of blocking Save.
export async function packFiles(strip, crop) {
  const files = []
  for (const [i, c] of strip.entries()) {
    if (isVideo(c)) {
      files.push(new File([c.blob], mediaFilename(c, i), { type: c.mime || c.blob.type }))
      continue
    }
    try {
      const jpeg = await crop(c)
      files.push(new File([jpeg], mediaFilename({ kind: c.kind, mime: 'image/jpeg' }, i), { type: 'image/jpeg' }))
    } catch (err) {
      console.warn('crop failed, using original', err)
      files.push(new File([c.blob], mediaFilename(c, i), { type: c.mime || c.blob.type }))
    }
  }
  return files
}

export async function renderReceipt(root, { aisleId }) {
  let aisle = await db.getAisle(aisleId)
  if (!aisle) return go('#/')
  const settings = await db.getSettings()
  const urls = urlBag()
  let strip = []
  // Photos are cropped ahead of time: iPhone only opens the share sheet straight from a tap.
  const crops = new Map() // capture id -> Promise<Blob>
  let packed = null // { key, files } ready for the next Save tap
  let saving = false

  const count = el('div', { class: 'center' })
  const stripEl = el('div', { class: 'strip' })
  const saveBtn = el('button', { class: 'btn btn-blue' }, 'Save photos + copy caption')
  const hint = el('p', { class: 'hint' })

  function cropFor(capture) {
    if (!crops.has(capture.id)) {
      const p = cropToJpeg(capture.blob)
      p.catch(() => crops.delete(capture.id))
      crops.set(capture.id, p)
    }
    return crops.get(capture.id)
  }

  async function refreshReady() {
    packed = null
    if (!strip.length) {
      saveBtn.disabled = true
      hint.textContent = '★ some shots in your basket first'
      return
    }
    saveBtn.disabled = true
    hint.textContent = 'Packing your photos…'
    const key = strip.map((c) => c.id).join()
    const files = await packFiles(strip, cropFor)
    if (key !== strip.map((c) => c.id).join()) return // strip changed meanwhile; a newer pack is running
    packed = { key, files }
    saveBtn.disabled = saving
    hint.textContent = ''
  }

  async function load() {
    strip = receiptStrip(await db.listCaptures(aisleId))
    drawStrip()
    refreshReady()
  }

  async function apply(patches) {
    await db.updateCaptures(patches)
    await load()
  }

  function drawStrip() {
    urls.revokeAll()
    count.textContent = `${aisle.name.toUpperCase()} · ${strip.length} ITEM${strip.length === 1 ? '' : 'S'}`
    stripEl.replaceChildren(...strip.map((c, i) => {
      const media = isVideo(c)
        ? el('video', { src: `${urls.url(c.blob)}#t=0.1`, muted: true, playsinline: true, preload: 'metadata' })
        : el('img', { src: urls.url(c.blob), alt: '' })
      const x = el('button', { class: 'x', 'aria-label': 'Drop from this post' }, '✕')
      x.addEventListener('pointerdown', (e) => e.stopPropagation())
      x.addEventListener('click', () => apply(removeFromOrder(strip, c.id)))
      const slot = el('div', { class: 'slot', 'data-index': String(i) }, media, el('span', { class: 'n' }, String(i + 1)), isVideo(c) ? el('span', { class: 'n', style: { top: 'auto', bottom: '3px' } }, '▶') : null, x)
      dragToReorder(slot, i)
      return slot
    }))
    if (!strip.length) stripEl.append(el('p', { class: 'muted' }, 'Nothing starred yet. Go back and ★ your favorite shots.'))
  }

  // Long-press a slot, then slide left/right to move it.
  function dragToReorder(slot, from) {
    let timer = null
    let dragging = false
    let to = from
    slot.addEventListener('contextmenu', (e) => e.preventDefault())
    // The strip scrolls normally; only once a long-press starts dragging do we stop the scroll.
    slot.addEventListener('touchmove', (e) => { if (dragging) e.preventDefault() }, { passive: false })
    let startX = 0
    // Moving more than a few px before the long-press fires means "scroll", not "drag".
    slot.addEventListener('pointermove', (e) => { if (!dragging && Math.abs(e.clientX - startX) > 8) clearTimeout(timer) })
    slot.addEventListener('pointerdown', (e) => {
      startX = e.clientX
      try { slot.setPointerCapture?.(e.pointerId) } catch { /* synthetic or ended pointer */ }
      timer = setTimeout(() => {
        dragging = true
        slot.classList.add('dragging')
        navigator.vibrate?.(10)
      }, LONG_PRESS_MS)
    })
    slot.addEventListener('pointermove', (e) => {
      if (!dragging) return
      e.preventDefault()
      const edge = stripEl.getBoundingClientRect()
      if (e.clientX < edge.left + 30) stripEl.scrollLeft -= 12
      else if (e.clientX > edge.right - 30) stripEl.scrollLeft += 12
      const slots = [...stripEl.querySelectorAll('.slot')]
      const hit = slots.findIndex((s) => {
        const r = s.getBoundingClientRect()
        return e.clientX >= r.left && e.clientX <= r.right
      })
      if (hit !== -1) to = hit
      slots.forEach((s, i) => { s.style.outline = i === to && i !== from ? '3px dashed var(--yellow)' : '' })
    })
    const end = () => {
      clearTimeout(timer)
      if (dragging && to !== from) apply(moveInOrder(strip, from, to))
      else if (dragging) slot.classList.remove('dragging')
      dragging = false
    }
    slot.addEventListener('pointerup', end)
    slot.addEventListener('pointercancel', end)
  }

  // ---------- notes + caption ----------

  const notes = await db.listNotes(aisleId)
  const notesList = el('div', { class: 'notes-list' },
    ...(notes.length
      ? notes.map((n) => el('div', {}, n.text?.trim() || '🎙 voice note'))
      : [el('div', { class: 'muted' }, 'No notes for this aisle.')]),
  )

  const caption = el('textarea', { class: 'field', placeholder: 'Write your caption here. Your notes above are the raw material.' })
  caption.value = await db.getDraft(aisleId)
  let draftTimer = null
  caption.addEventListener('input', () => {
    clearTimeout(draftTimer)
    draftTimer = setTimeout(() => db.saveDraft(aisleId, caption.value), 500)
  })

  let lastCursor = caption.value.length
  const rememberCursor = () => { lastCursor = caption.selectionStart ?? caption.value.length }
  caption.addEventListener('keyup', rememberCursor)
  caption.addEventListener('click', rememberCursor)
  caption.addEventListener('blur', rememberCursor)

  const chips = el('div', { class: 'chips' },
    ...settings.snippets.map((s) => el('button', {
      class: 'chip',
      onpointerdown: (e) => e.preventDefault(), // keep the keyboard / cursor where it is
      onclick: () => {
        const cursor = document.activeElement === caption ? caption.selectionStart : lastCursor
        const next = insertSnippet(caption.value, Math.min(cursor, caption.value.length), s.text)
        caption.value = next.text
        caption.setSelectionRange(next.cursor, next.cursor)
        lastCursor = next.cursor
        caption.dispatchEvent(new Event('input'))
      },
    }, s.label)),
    el('button', { class: 'chip', style: { background: 'var(--white)', color: 'var(--sky)', border: '1.5px dashed var(--sky)' }, onclick: () => go('#/settings') }, '+ snippet'),
  )

  // ---------- save ----------

  saveBtn.addEventListener('click', async () => {
    if (saving || !packed) return
    saving = true
    saveBtn.disabled = true
    try {
      // Share and copy start right inside the tap: iPhone requires a fresh tap for both.
      const sharing = shareFiles(packed.files)
      const copied = copyText(caption.value)
      clearTimeout(draftTimer)
      db.saveDraft(aisleId, caption.value)
      const result = await sharing
      const copyOk = await copied
      if (copyOk && caption.value.trim()) toast('Caption copied, paste it in Instagram ✓')
      else if (!caption.value.trim()) toast('Saved. Write a caption next time!', 'warn')
      if (result === 'cancelled') return
      if (!aisle.checkedOut && (await confirmSheet('Mark this aisle as checked out ✓?', { yes: 'Check out ✓', no: 'Not yet' }))) {
        aisle = await db.updateAisle(aisleId, { checkedOut: true })
        toast('✓ Checked out. Nice work!')
      }
    } catch (err) {
      console.error(err)
      toast(`Couldn't save: ${err.message || err}`, 'error')
    } finally {
      saving = false
      saveBtn.disabled = !packed
    }
  })

  root.append(
    el('div', { class: 'topbar' },
      el('button', { class: 'icon-btn', 'aria-label': 'Back to basket', onclick: () => go(`#/aisle/${aisleId}`) }, '←'),
      el('span'),
    ),
    el('div', { class: 'receipt' },
      el('h2', {}, 'RECEIPT'),
      count,
      el('div', { class: 'rule' }, 'IN THIS POST'),
      stripEl,
      el('p', { class: 'muted', style: { margin: 0, fontSize: '11px' } }, 'Hold & slide to reorder · ✕ to leave one out'),
      el('div', { class: 'rule' }, 'YOUR NOTES'),
      notesList,
      el('div', { class: 'rule' }, 'CAPTION'),
      caption,
      chips,
      saveBtn,
      hint,
    ),
  )
  await load()

  return () => {
    clearTimeout(draftTimer)
    db.saveDraft(aisleId, caption.value)
    urls.revokeAll()
  }
}
