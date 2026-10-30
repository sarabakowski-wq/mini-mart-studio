import * as db from '../db.js'
import { el, toast, sheet, confirmSheet, promptSheet, urlBag } from '../ui.js'
import { go } from '../router.js'
import { groupByDay, receiptStrip, removeFromOrder } from '../logic.js'
import { buildBackup } from '../exporter.js'
import { shareFiles } from '../share.js'
import { unlockAudio } from '../nudge.js'

const isVideo = (c) => c.kind === 'video' || c.mime?.startsWith('video/')
const fmtTime = (ts) => new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

function dayLabel(day, count) {
  const today = new Date()
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const isToday = date.toDateString() === today.toDateString()
  const label = isToday ? 'TODAY' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase()
  return isToday ? `${label} · ${count} item${count === 1 ? '' : 's'} in basket` : label
}

// Deleting a capture that sits in the receipt strip closes the gap behind it.
export async function deleteCaptureKeepingOrder(aisleId, capture) {
  if (capture.receiptOrder != null && capture.receiptOrder >= 0) {
    const strip = receiptStrip(await db.listCaptures(aisleId))
    const patches = removeFromOrder(strip, capture.id).filter((p) => p.id !== capture.id)
    await db.updateCaptures(patches)
  }
  await db.deleteCapture(capture.id)
}

export async function renderBasket(root, { aisleId }) {
  let aisle = await db.getAisle(aisleId)
  if (!aisle) return go('#/')
  const urls = urlBag()
  const content = el('div')
  const title = el('h1', { class: 'title' }, aisle.name)

  function tile(capture) {
    const media = isVideo(capture)
      ? el('video', { src: `${urls.url(capture.blob)}#t=0.1`, muted: true, playsinline: true, preload: 'metadata' })
      : el('img', { src: urls.url(capture.blob), alt: '', loading: 'lazy' })
    return el('button', { class: 'tile', onclick: () => openViewer(capture) },
      media,
      isVideo(capture) ? el('span', { class: 'badge play' }, '▶') : null,
      capture.starred ? el('span', { class: 'badge star' }, '★') : null,
    )
  }

  function noteRow(note) {
    const text = note.text?.trim()
    return el('div', { class: 'note', onclick: () => editNote(note) },
      note.audioBlob ? '🎙 ' : '✏️ ',
      text ? `“${text}”` : el('i', {}, 'voice note, tap to type'),
      el('span', { class: 'when' }, fmtTime(note.createdAt)),
    )
  }

  async function draw() {
    urls.revokeAll()
    const [captures, notes] = await Promise.all([db.listCaptures(aisleId), db.listNotes(aisleId)])
    const groups = groupByDay(captures, notes)
    if (!groups.length) {
      content.replaceChildren(el('div', { class: 'empty' },
        el('p', {}, 'Your basket is empty.'),
        el('p', {}, 'Open the store to start snapping your process.'),
      ))
    } else {
      content.replaceChildren(...groups.flatMap((g) => [
        el('p', { class: 'day' }, dayLabel(g.day, g.captures.length)),
        g.captures.length ? el('div', { class: 'grid' }, ...g.captures.map(tile)) : null,
        ...g.notes.map(noteRow),
      ].filter(Boolean)))
    }
    checkout.disabled = !captures.some((c) => c.starred)
    checkoutHint.hidden = !checkout.disabled || !captures.length
  }

  async function editNote(note) {
    const audio = note.audioBlob ? el('audio', { controls: true, src: urls.url(note.audioBlob), style: { width: '100%' } }) : null
    const result = await sheet((close) => {
      const ta = el('textarea', { class: 'field', placeholder: 'Type what you said…' }, note.text || '')
      return [
        el('p', { class: 'sheet-msg' }, note.audioBlob ? 'Voice note' : 'Note'),
        audio,
        ta,
        el('div', { class: 'sheet-actions' },
          el('button', { class: 'btn btn-ghost', style: { marginRight: 'auto' }, onclick: () => close({ remove: true }) }, 'Delete'),
          el('button', { class: 'btn btn-ghost', onclick: () => close(null) }, 'Cancel'),
          el('button', { class: 'btn btn-blue', onclick: () => close({ text: ta.value.trim() }) }, 'Save'),
        ),
      ].filter(Boolean)
    })
    if (!result) return
    if (result.remove) {
      if (!(await confirmSheet('Delete this note?', { yes: 'Delete', danger: true }))) return
      await db.deleteNote(note.id)
    } else {
      await db.updateNote(note.id, { text: result.text })
    }
    draw()
  }

  function openViewer(capture) {
    const notesFor = async () => (await db.listNotes(aisleId)).filter((n) => n.captureId === capture.id)
    const media = isVideo(capture)
      ? el('video', { src: urls.url(capture.blob), controls: true, playsinline: true, autoplay: true })
      : el('img', { src: urls.url(capture.blob), alt: '' })
    const star = el('button', { class: 'btn btn-ghost' })
    const paintStar = () => { star.textContent = capture.starred ? '★ Starred' : '☆ Star it' }
    paintStar()
    star.addEventListener('click', async () => {
      capture = await db.updateCapture(capture.id, { starred: !capture.starred, receiptOrder: capture.starred ? capture.receiptOrder : null })
      paintStar()
    })
    const noteBox = el('textarea', { class: 'field', placeholder: 'Add a note about this one…', style: { minHeight: '60px' } })
    let linked = null
    notesFor().then((ns) => { linked = ns[0] || null; noteBox.value = linked?.text || '' })

    const close = async () => {
      const text = noteBox.value.trim()
      if (linked && text !== (linked.text || '')) await db.updateNote(linked.id, { text })
      else if (!linked && text) await db.addNote({ aisleId, captureId: capture.id, text })
      viewer.remove()
      draw()
    }
    const remove = async () => {
      if (!(await confirmSheet('Delete this capture?', { yes: 'Delete', danger: true }))) return
      await deleteCaptureKeepingOrder(aisleId, capture)
      viewer.remove()
      draw()
    }

    const viewer = el('div', { class: 'viewer' },
      el('div', { class: 'viewer-top' },
        el('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, '✕'),
        el('button', { class: 'icon-btn', 'aria-label': 'Delete', onclick: remove }, '🗑'),
      ),
      el('div', { class: 'viewer-media' }, media),
      el('div', { class: 'viewer-bar' }, star, noteBox),
    )
    document.body.append(viewer)
  }

  async function menu() {
    const choice = await sheet((close) => [
      el('p', { class: 'sheet-msg' }, `A${aisle.number} · ${aisle.name}`),
      el('button', { class: 'btn btn-ghost', onclick: () => close('rename') }, '✏️ Rename'),
      el('button', { class: 'btn btn-ghost', onclick: () => close('export') }, '📦 Export backup (.zip)'),
      aisle.checkedOut ? el('button', { class: 'btn btn-ghost', onclick: () => close('reopen') }, '↺ Mark as not checked out') : null,
      el('button', { class: 'btn btn-ghost', onclick: () => close('archive') }, aisle.archived ? '📤 Unarchive' : '📥 Archive'),
      el('button', { class: 'btn btn-ghost', style: { color: 'var(--red)' }, onclick: () => close('delete') }, '🗑 Delete aisle'),
    ].filter(Boolean))
    if (choice === 'rename') {
      const name = await promptSheet('Rename aisle', { value: aisle.name })
      if (name) { aisle = await db.updateAisle(aisleId, { name }); title.textContent = name }
    } else if (choice === 'export') {
      toast('Packing your backup…')
      let file
      try {
        file = await buildBackup(aisleId)
      } catch (err) {
        console.error(err)
        return toast(`Export failed: ${err.message}`, 'error')
      }
      // Share from a fresh tap: iPhone won't open the share sheet after a long wait.
      await sheet((close) => [
        el('p', { class: 'sheet-msg' }, `📦 Backup ready (${Math.max(1, Math.round(file.size / 1e6))} MB)`),
        el('p', { class: 'muted', style: { margin: 0 } }, 'Save it to Files or iCloud Drive.'),
        el('div', { class: 'sheet-actions' },
          el('button', { class: 'btn btn-ghost', onclick: () => close() }, 'Later'),
          el('button', { class: 'btn btn-blue', onclick: async () => { const r = await shareFiles([file]); close(); if (r !== 'cancelled') toast('Backup saved ✓') } }, 'Save backup'),
        ),
      ])
    } else if (choice === 'reopen') {
      aisle = await db.updateAisle(aisleId, { checkedOut: false })
    } else if (choice === 'archive') {
      aisle = await db.updateAisle(aisleId, { archived: !aisle.archived })
      toast(aisle.archived ? 'Archived' : 'Back on the shelves')
      go('#/')
    } else if (choice === 'delete') {
      const ok = await confirmSheet(`Delete “${aisle.name}” and everything in it? This can't be undone. Export a backup first if you want to keep it.`, { yes: 'Delete forever', danger: true })
      if (!ok) return
      await db.deleteAisle(aisleId)
      toast('Aisle deleted')
      go('#/')
    }
  }

  const checkout = el('button', { class: 'btn btn-blue fab', onclick: () => go(`#/aisle/${aisleId}/receipt`) }, '🧾 Check out')
  const checkoutHint = el('p', { class: 'hint', hidden: true }, '★ some shots to check out')

  root.append(
    el('div', { class: 'topbar' },
      el('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => go('#/') }, '←'),
      el('div', { class: 'row' },
        el('button', { class: 'btn btn-red', style: { padding: '8px 14px', fontSize: '15px' }, onclick: () => { unlockAudio(); go(`#/aisle/${aisleId}/session`) } }, '▶ Open store'),
        el('button', { class: 'icon-btn', 'aria-label': 'Aisle menu', onclick: menu }, '⋯'),
      ),
    ),
    el('p', { class: 'label', style: { marginBottom: 0 } }, `AISLE ${aisle.number}`),
    title,
    checkoutHint,
    content,
    checkout,
  )
  await draw()

  return () => {
    urls.revokeAll()
    document.querySelector('.viewer')?.remove()
  }
}
