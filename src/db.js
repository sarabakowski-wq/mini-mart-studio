// IndexedDB wrapper. The only module that touches storage.
//
// aisle    { id, number, name, createdAt, updatedAt, archived, checkedOut, lastMode }
// capture  { id, aisleId, kind: 'photo'|'video'|'import', blob, mime, createdAt, starred, receiptOrder }
// note     { id, aisleId, captureId, text, audioBlob, audioMime, createdAt }
// draft    { aisleId, caption, updatedAt }
// settings { key: 'settings', nudgeMinutes, snippets: [{ id, label, text }], persistNoticeShown }

const DB_NAME = 'mini-mart-studio'
const DB_VERSION = 1

const DEFAULT_SETTINGS = { nudgeMinutes: 10, snippets: [], persistNoticeShown: false }

export class QuotaError extends Error {
  constructor(cause) {
    super("Couldn't save, your phone storage is full.")
    this.name = 'QuotaError'
    this.cause = cause
  }
}

const isQuota = (err) => err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
const wrap = (err) => (isQuota(err) ? new QuotaError(err) : err)

let dbPromise = null

export function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const idb = req.result
      idb.createObjectStore('aisles', { keyPath: 'id' })
      idb.createObjectStore('captures', { keyPath: 'id' }).createIndex('aisleId', 'aisleId')
      idb.createObjectStore('notes', { keyPath: 'id' }).createIndex('aisleId', 'aisleId')
      idb.createObjectStore('drafts', { keyPath: 'aisleId' })
      idb.createObjectStore('settings', { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

// Runs fn(stores) inside one transaction; resolves with fn's return value once the transaction commits.
async function tx(storeNames, mode, fn) {
  const idb = await openDb()
  return new Promise((resolve, reject) => {
    let result
    let t
    try {
      t = idb.transaction(storeNames, mode)
      const stores = Object.fromEntries([storeNames].flat().map((n) => [n, t.objectStore(n)]))
      result = fn(stores)
    } catch (err) {
      try { t?.abort() } catch { /* already aborted */ }
      reject(wrap(err))
      return
    }
    t.oncomplete = () => resolve(result instanceof IDBRequest ? result.result : result)
    t.onabort = t.onerror = () => reject(wrap(t.error))
  })
}

const req = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result)
  r.onerror = () => reject(wrap(r.error))
})

const now = () => Date.now()
const uid = () => crypto.randomUUID()

// ---------- aisles ----------

export async function createAisle(name) {
  const all = await tx('aisles', 'readonly', (s) => s.aisles.getAll())
  const number = all.reduce((max, a) => Math.max(max, a.number), 0) + 1
  const t = now()
  const aisle = { id: uid(), number, name, createdAt: t, updatedAt: t, archived: false, checkedOut: false, lastMode: 'hands-on' }
  await tx('aisles', 'readwrite', (s) => s.aisles.put(aisle))
  return aisle
}

export async function listAisles({ archived = false } = {}) {
  const all = await tx('aisles', 'readonly', (s) => s.aisles.getAll())
  return all.filter((a) => a.archived === archived).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getAisle(id) {
  return tx('aisles', 'readonly', (s) => s.aisles.get(id))
}

export async function updateAisle(id, patch) {
  const cur = await getAisle(id)
  if (!cur) return null
  const updated = { ...cur, ...patch }
  await tx('aisles', 'readwrite', (s) => s.aisles.put(updated))
  return updated
}

// Deletes an aisle with all its captures, notes and draft.
export async function deleteAisle(id) {
  const [caps, notes] = await Promise.all([listCaptures(id), listNotes(id)])
  await tx(['aisles', 'captures', 'notes', 'drafts'], 'readwrite', (s) => {
    caps.forEach((c) => s.captures.delete(c.id))
    notes.forEach((n) => s.notes.delete(n.id))
    s.drafts.delete(id)
    s.aisles.delete(id)
  })
}

function touchAisle(store, aisleId) {
  const r = store.get(aisleId)
  r.onsuccess = () => { if (r.result) store.put({ ...r.result, updatedAt: now() }) }
}

// ---------- captures ----------

export async function addCapture({ aisleId, kind, blob, mime }) {
  const capture = { id: uid(), aisleId, kind, blob, mime: mime || blob.type, createdAt: now(), starred: false, receiptOrder: null }
  await tx(['captures', 'aisles'], 'readwrite', (s) => {
    s.captures.put(capture)
    touchAisle(s.aisles, aisleId)
  })
  return capture
}

export async function listCaptures(aisleId) {
  const all = await tx('captures', 'readonly', (s) => s.captures.index('aisleId').getAll(aisleId))
  return all.sort((a, b) => a.createdAt - b.createdAt)
}

export async function countCaptures(aisleId) {
  return tx('captures', 'readonly', (s) => s.captures.index('aisleId').count(aisleId))
}

export function getCapture(id) {
  return tx('captures', 'readonly', (s) => s.captures.get(id))
}

export async function updateCapture(id, patch) {
  const cur = await getCapture(id)
  if (!cur) return null
  const updated = { ...cur, ...patch }
  await tx('captures', 'readwrite', (s) => s.captures.put(updated))
  return updated
}

export async function updateCaptures(patches) {
  if (!patches.length) return
  const idb = await openDb()
  const t = idb.transaction('captures', 'readwrite')
  const store = t.objectStore('captures')
  const current = await Promise.all(patches.map((p) => req(store.get(p.id))))
  current.forEach((cur, i) => { if (cur) store.put({ ...cur, ...patches[i] }) })
  await new Promise((resolve, reject) => {
    t.oncomplete = resolve
    t.onabort = t.onerror = () => reject(wrap(t.error))
  })
}

export async function deleteCapture(id) {
  const linked = await tx('notes', 'readonly', (s) => s.notes.getAll())
  await tx(['captures', 'notes'], 'readwrite', (s) => {
    s.captures.delete(id)
    linked.filter((n) => n.captureId === id).forEach((n) => s.notes.delete(n.id))
  })
}

// ---------- notes ----------

export async function addNote({ aisleId, captureId = null, text = '', audioBlob = null, audioMime = null }) {
  const note = { id: uid(), aisleId, captureId, text, audioBlob, audioMime: audioMime || audioBlob?.type || null, createdAt: now() }
  await tx(['notes', 'aisles'], 'readwrite', (s) => {
    s.notes.put(note)
    touchAisle(s.aisles, aisleId)
  })
  return note
}

export async function listNotes(aisleId) {
  const all = await tx('notes', 'readonly', (s) => s.notes.index('aisleId').getAll(aisleId))
  return all.sort((a, b) => a.createdAt - b.createdAt)
}

export async function updateNote(id, patch) {
  const cur = await tx('notes', 'readonly', (s) => s.notes.get(id))
  if (!cur) return null
  const updated = { ...cur, ...patch }
  await tx('notes', 'readwrite', (s) => s.notes.put(updated))
  return updated
}

export function deleteNote(id) {
  return tx('notes', 'readwrite', (s) => s.notes.delete(id))
}

// ---------- drafts ----------

export async function getDraft(aisleId) {
  const d = await tx('drafts', 'readonly', (s) => s.drafts.get(aisleId))
  return d?.caption ?? ''
}

export function saveDraft(aisleId, caption) {
  return tx('drafts', 'readwrite', (s) => s.drafts.put({ aisleId, caption, updatedAt: now() }))
}

// ---------- settings ----------

export async function getSettings() {
  const stored = await tx('settings', 'readonly', (s) => s.settings.get('settings'))
  const { key, ...rest } = stored || {}
  return { ...DEFAULT_SETTINGS, ...rest }
}

export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch }
  await tx('settings', 'readwrite', (s) => s.settings.put({ key: 'settings', ...next }))
  return next
}

// ---------- tests only ----------

export async function _resetForTests() {
  if (dbPromise) (await dbPromise).close()
  dbPromise = null
  await new Promise((resolve) => {
    const r = indexedDB.deleteDatabase(DB_NAME)
    r.onsuccess = r.onerror = r.onblocked = () => resolve()
  })
}
