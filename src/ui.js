// Tiny DOM helpers shared by every screen.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value)
    } else if (key === 'class') {
      node.className = value
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(node.style, value)
    } else if (key in node && typeof value !== 'string') {
      node[key] = value
    } else {
      node.setAttribute(key, value === true ? '' : value)
    }
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue
    node.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
  return node
}

export function toast(message, kind = 'ok') {
  const node = el('div', { class: `toast toast-${kind}`, role: 'status' }, message)
  document.body.append(node)
  requestAnimationFrame(() => node.classList.add('show'))
  setTimeout(() => {
    node.classList.remove('show')
    setTimeout(() => node.remove(), 300)
  }, kind === 'error' ? 5000 : 3000)
}

// Bottom sheet with arbitrary content. Resolves with whatever close(value) is called with.
export function sheet(build) {
  return new Promise((resolve) => {
    const backdrop = el('div', { class: 'sheet-backdrop' })
    const panel = el('div', { class: 'sheet' })
    const close = (value) => {
      backdrop.remove()
      resolve(value)
    }
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(undefined) })
    panel.append(...[build(close)].flat())
    backdrop.append(panel)
    document.body.append(backdrop)
  })
}

export function confirmSheet(message, { yes = 'Yes', no = 'Cancel', danger = false } = {}) {
  return sheet((close) => [
    el('p', { class: 'sheet-msg' }, message),
    el('div', { class: 'sheet-actions' },
      el('button', { class: 'btn btn-ghost', onclick: () => close(false) }, no),
      el('button', { class: danger ? 'btn btn-red' : 'btn btn-blue', onclick: () => close(true) }, yes),
    ),
  ]).then(Boolean)
}

export function promptSheet(message, { value = '', placeholder = '', ok = 'Save' } = {}) {
  return sheet((close) => {
    const input = el('input', { class: 'field', value, placeholder })
    const submit = () => close(input.value.trim() || null)
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit() })
    setTimeout(() => input.focus(), 50)
    return [
      el('p', { class: 'sheet-msg' }, message),
      input,
      el('div', { class: 'sheet-actions' },
        el('button', { class: 'btn btn-ghost', onclick: () => close(null) }, 'Cancel'),
        el('button', { class: 'btn btn-blue', onclick: submit }, ok),
      ),
    ]
  })
}

let bannerTimer = null
export function showBanner(text, ms = 10000) {
  hideBanner()
  const node = el('div', { class: 'nudge-banner', id: 'nudge-banner' }, text)
  document.body.append(node)
  bannerTimer = setTimeout(hideBanner, ms)
}

export function hideBanner() {
  clearTimeout(bannerTimer)
  document.getElementById('nudge-banner')?.remove()
}

export function relativeTime(ts, now = Date.now()) {
  const mins = Math.round((now - ts) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Object URLs for blobs, revoked when the screen goes away.
export function urlBag() {
  const urls = []
  return {
    url(blob) {
      const u = URL.createObjectURL(blob)
      urls.push(u)
      return u
    },
    revokeAll() {
      urls.splice(0).forEach((u) => URL.revokeObjectURL(u))
    },
  }
}
