// Per-aisle backup: a zip with media/, voice/ and notes.txt.
import * as db from './db.js'

const pad = (n) => String(n).padStart(2, '0')

export function dateStamp(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function timeStamp(ts) {
  const d = new Date(ts)
  return `${dateStamp(ts)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function slugify(name) {
  const slug = (name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'aisle'
}

const EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/heif': 'heif', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
  'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'weba', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg',
}

export function extFor(mime) {
  const base = (mime || '').split(';')[0].trim().toLowerCase()
  return EXT[base] || base.split('/')[1] || 'bin'
}

export function mediaFilename(capture, index) {
  return `${pad(index + 1)}-${capture.kind}.${extFor(capture.mime)}`
}

export function buildNotesTxt({ aisle, notes, caption }) {
  const lines = [`Aisle A${aisle.number} · ${aisle.name}`, '']
  for (const n of notes) {
    const text = n.text?.trim() || (n.audioBlob ? '(voice note, no text)' : '(empty note)')
    lines.push(`${timeStamp(n.createdAt)}  ${text}`)
  }
  lines.push('', 'CAPTION DRAFT', caption || '', '')
  return lines.join('\n')
}

// Builds the backup zip. Sharing happens separately, from a fresh tap (iPhone requirement).
export async function buildBackup(aisleId) {
  const aisle = await db.getAisle(aisleId)
  const [captures, notes, caption] = await Promise.all([db.listCaptures(aisleId), db.listNotes(aisleId), db.getDraft(aisleId)])
  const zip = new window.JSZip()
  captures.forEach((c, i) => zip.file(`media/${mediaFilename(c, i)}`, c.blob))
  notes.filter((n) => n.audioBlob).forEach((n, i) => {
    zip.file(`voice/${pad(i + 1)}-${dateStamp(n.createdAt)}.${extFor(n.audioMime || n.audioBlob.type)}`, n.audioBlob)
  })
  zip.file('notes.txt', buildNotesTxt({ aisle, notes, caption }))
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' })
  return new File([blob], `${slugify(aisle.name)}-${dateStamp(Date.now())}.zip`, { type: 'application/zip' })
}
