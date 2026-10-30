import { startRouter } from './router.js'
import { el } from './ui.js'

const stub = (name) => (root) => {
  root.append(el('h1', { class: 'title' }, name))
}

const screens = {
  aisles: stub('Your Aisles'),
  settings: stub('Settings'),
  basket: stub('Basket'),
  session: stub('Session'),
  receipt: stub('Receipt'),
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW failed', err))
}

startRouter(document.getElementById('app'), screens)
