import * as db from '../db.js'
import { el, sheet, promptSheet, relativeTime, toast } from '../ui.js'
import { storageLevel } from '../logic.js'
import { go } from '../router.js'

const fmtBytes = (b) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`)

export async function renderAisles(root) {
  let showArchived = false

  const list = el('div')
  const storage = el('div')

  async function draw() {
    const aisles = await db.listAisles({ archived: showArchived })
    const counts = await Promise.all(aisles.map((a) => db.countCaptures(a.id)))
    list.replaceChildren(...[
      ...aisles.map((a, i) => el('button', { class: `aisle-card${a.checkedOut ? ' done' : ''}`, onclick: () => go(`#/aisle/${a.id}`) },
        el('span', { class: 'aisle-num' }, `A${a.number}`),
        el('span', { class: 'grow' },
          el('span', { class: 'aisle-name' }, a.name),
          el('span', { class: 'aisle-meta' },
            `${counts[i]} capture${counts[i] === 1 ? '' : 's'} · ${a.checkedOut ? '✓ checked out' : relativeTime(a.updatedAt)}`),
        ),
      )),
      showArchived
        ? (aisles.length ? null : el('p', { class: 'empty' }, 'No archived aisles.'))
        : el('button', { class: 'aisle-card aisle-new', onclick: newAisle }, '+ New aisle'),
    ].filter(Boolean))
  }

  async function newAisle() {
    const name = await promptSheet('Name this aisle', { placeholder: 'e.g. Floor mural', ok: 'Stock it' })
    if (!name) return
    const aisle = await db.createAisle(name)
    go(`#/aisle/${aisle.id}`)
  }

  async function openStore() {
    const aisles = await db.listAisles()
    if (!aisles.length) {
      toast('Make an aisle first, one per project.', 'warn')
      return newAisle()
    }
    const picked = await sheet((close) => [
      el('p', { class: 'sheet-msg' }, 'Which aisle are you working on?'),
      ...aisles.map((a) => el('button', { class: 'aisle-card', onclick: () => close(a.id) },
        el('span', { class: 'aisle-num' }, `A${a.number}`), el('span', { class: 'aisle-name grow' }, a.name))),
      el('button', { class: 'aisle-card aisle-new', onclick: () => close('new') }, '+ New aisle'),
    ])
    if (picked === 'new') return newAisle()
    if (picked) go(`#/aisle/${picked}/session`)
  }

  async function drawStorage() {
    const est = await navigator.storage?.estimate?.().catch(() => null)
    if (!est || !est.quota) return storage.replaceChildren()
    const level = storageLevel(est.usage, est.quota)
    const pct = Math.min(100, (est.usage / est.quota) * 100)
    storage.replaceChildren(...[
      level === 'warn' ? el('div', { class: 'warn-card' }, 'Storage is almost full. Export and delete an old aisle to free space.') : null,
      el('div', { class: `storage ${level}` },
        `Using ${fmtBytes(est.usage)} of ${fmtBytes(est.quota)}`,
        el('div', { class: 'storage-bar' }, el('div', { style: { width: `${pct.toFixed(1)}%` } })),
      ),
    ].filter(Boolean))
  }

  const archivedToggle = el('button', { class: 'link' }, 'Show archived')
  archivedToggle.addEventListener('click', () => {
    showArchived = !showArchived
    archivedToggle.textContent = showArchived ? 'Back to aisles' : 'Show archived'
    title.textContent = showArchived ? 'Archived' : 'Your Aisles'
    draw()
  })
  const title = el('h1', { class: 'title' }, 'Your Aisles')

  root.append(
    el('div', { class: 'topbar' },
      el('span'),
      el('button', { class: 'icon-btn', 'aria-label': 'Settings', onclick: () => go('#/settings') }, '⚙'),
    ),
    el('img', { class: 'wordmark', src: 'assets/logo-wordmark.png', alt: "Sara's Mini Mart" }),
    title,
    list,
    el('div', { style: { textAlign: 'center', marginTop: '8px' } }, archivedToggle),
    storage,
    el('button', { class: 'btn btn-red fab', onclick: openStore }, '▶ Open the store'),
  )
  await Promise.all([draw(), drawStorage()])
}
