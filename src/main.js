import { startRouter } from './router.js'
import { el, toast } from './ui.js'
import * as db from './db.js'
import { renderAisles } from './screens/aisles.js'
import { renderSettings } from './screens/settings.js'
import { renderSession } from './screens/session.js'

const stub = (name) => (root) => {
  root.append(el('h1', { class: 'title' }, name))
}

const screens = {
  aisles: renderAisles,
  settings: renderSettings,
  basket: stub('Basket'),
  session: renderSession,
  receipt: stub('Receipt'),
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW failed', err))
}

async function askForPersistence() {
  if (!navigator.storage?.persist) return
  if (await navigator.storage.persisted?.()) return
  const granted = await navigator.storage.persist().catch(() => false)
  if (granted) return
  const settings = await db.getSettings()
  if (settings.persistNoticeShown) return
  await db.saveSettings({ persistNoticeShown: true })
  toast('Tip: export your aisles now and then, since iPhone may clear app data.', 'warn')
}

startRouter(document.getElementById('app'), screens)
askForPersistence()
