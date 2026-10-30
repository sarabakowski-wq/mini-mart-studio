// Hash routes:
//   #/                      aisles (home)
//   #/settings              settings
//   #/aisle/:id             basket
//   #/aisle/:id/session     session
//   #/aisle/:id/receipt     receipt

export function parseRoute(hash) {
  const parts = (hash || '').replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 'settings' && parts.length === 1) return { name: 'settings', aisleId: null }
  if (parts[0] === 'aisle' && parts[1]) {
    const aisleId = decodeURIComponent(parts[1])
    if (parts.length === 2) return { name: 'basket', aisleId }
    if (parts.length === 3 && (parts[2] === 'session' || parts[2] === 'receipt')) {
      return { name: parts[2], aisleId }
    }
  }
  return { name: 'aisles', aisleId: null }
}

export function go(hash) {
  location.hash = hash
}

// screens: { [name]: (root, params) => cleanup | void | Promise<cleanup | void> }
export function startRouter(root, screens) {
  let cleanup = null

  async function render() {
    if (typeof cleanup === 'function') {
      try { await cleanup() } catch (err) { console.error(err) }
    }
    cleanup = null
    const route = parseRoute(location.hash)
    root.replaceChildren()
    root.dataset.screen = route.name
    window.scrollTo(0, 0)
    try {
      cleanup = await screens[route.name](root, route)
    } catch (err) {
      console.error(err)
      root.textContent = 'Something went wrong. Pull down to reload.'
    }
  }

  window.addEventListener('hashchange', render)
  render()
}
