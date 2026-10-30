import * as db from '../db.js'
import { el, sheet, confirmSheet, toast } from '../ui.js'
import { clampNudgeMinutes } from '../logic.js'
import { go } from '../router.js'

export async function renderSettings(root) {
  let settings = await db.getSettings()

  const minutes = el('input', { class: 'field', type: 'number', inputmode: 'numeric', min: '5', max: '30', value: String(settings.nudgeMinutes), style: { width: '90px' } })
  minutes.addEventListener('change', async () => {
    const v = clampNudgeMinutes(minutes.value)
    minutes.value = String(v)
    settings = await db.saveSettings({ nudgeMinutes: v })
    toast(`Nudge every ${v} minutes`)
  })

  const snippetList = el('div')

  function drawSnippets() {
    snippetList.replaceChildren(
      ...(settings.snippets.length
        ? settings.snippets.map((s) => el('div', { class: 'card row' },
          el('div', { class: 'grow' },
            el('div', {}, s.label),
            el('div', { class: 'muted', style: { whiteSpace: 'pre-wrap' } }, s.text)),
          el('button', { class: 'icon-btn', 'aria-label': 'Edit', onclick: () => editSnippet(s) }, '✏️'),
        ))
        : [el('p', { class: 'muted' }, 'No snippets yet. Add hashtag sets or sign-offs you reuse.')]),
      el('button', { class: 'btn btn-ghost', onclick: () => editSnippet(null) }, '+ Add snippet'),
    )
  }

  async function editSnippet(existing) {
    const result = await sheet((close) => {
      const label = el('input', { class: 'field', placeholder: 'Chip label, e.g. #process tags', value: existing?.label || '' })
      const text = el('textarea', { class: 'field', placeholder: '#processvideo #illustration #wip' }, existing?.text || '')
      return [
        el('p', { class: 'sheet-msg' }, existing ? 'Edit snippet' : 'New snippet'),
        label,
        text,
        el('div', { class: 'sheet-actions' },
          existing ? el('button', { class: 'btn btn-ghost', style: { marginRight: 'auto' }, onclick: () => close({ remove: true }) }, 'Delete') : null,
          el('button', { class: 'btn btn-ghost', onclick: () => close(null) }, 'Cancel'),
          el('button', { class: 'btn btn-blue', onclick: () => close({ label: label.value.trim(), text: text.value.trim() }) }, 'Save'),
        ),
      ]
    })
    if (!result) return
    let snippets = [...settings.snippets]
    if (result.remove) {
      if (!(await confirmSheet('Delete this snippet?', { yes: 'Delete', danger: true }))) return
      snippets = snippets.filter((s) => s.id !== existing.id)
    } else {
      if (!result.text) return toast('Snippet text is empty', 'warn')
      const item = { id: existing?.id || crypto.randomUUID(), label: result.label || result.text.slice(0, 18), text: result.text }
      snippets = existing ? snippets.map((s) => (s.id === existing.id ? item : s)) : [...snippets, item]
    }
    settings = await db.saveSettings({ snippets })
    drawSnippets()
  }

  drawSnippets()

  root.append(
    el('div', { class: 'topbar' },
      el('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => go('#/') }, '←'),
      el('span'),
    ),
    el('h1', { class: 'title' }, 'Settings'),

    el('p', { class: 'label' }, 'NUDGES'),
    el('div', { class: 'card row' },
      el('span', { class: 'grow' }, 'Nudge me every'),
      minutes,
      el('span', {}, 'min'),
    ),

    el('p', { class: 'label' }, 'CAPTION SNIPPETS'),
    snippetList,

    el('p', { class: 'label' }, 'REMINDERS WHEN THE APP IS CLOSED'),
    el('div', { class: 'card help' },
      el('p', { style: { marginTop: 0 } }, 'Nudges only ring while Mini Mart is open on screen. For a reminder when it\'s closed, use the free Shortcuts app:'),
      el('ol', {},
        el('li', {}, 'Open Shortcuts → Automation → + → Time of Day.'),
        el('li', {}, 'Pick when you usually make art (e.g. 7 PM, weekdays) and choose Run Immediately.'),
        el('li', {}, 'Add the action "Show Notification" with "Mini Mart: open the store and snap your process!"'),
        el('li', {}, 'Tap the notification, then tap the Mini Mart icon on your home screen.'),
      ),
    ),

    el('p', { class: 'label' }, 'BACKUPS'),
    el('div', { class: 'card help' }, 'Everything is saved only on this phone. Use Export in each aisle\'s menu now and then to save a .zip to Files or iCloud Drive.'),
  )
}
