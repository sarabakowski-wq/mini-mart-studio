# Mini Mart Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A free, installable, Sara's Mini Mart–branded phone web app to capture an art process per project (aisle) during timed-nudge sessions, then package starred captures + a hand-written caption for Instagram.

**Architecture:** Static PWA with plain HTML/CSS/ES modules and no build step, served from GitHub Pages. All data lives in IndexedDB on the phone. Pure logic (timing, crop math, grouping, ordering, filenames) lives in small modules covered by Vitest. Browser-API glue (camera, recorder, share sheet, speech) stays thin and is verified on the device.

**Tech Stack:** HTML/CSS/JS (ES modules), IndexedDB, MediaRecorder, Web Audio, Wake Lock, Web Share, Service Worker. Dev only: Node 20+, Vitest, jsdom, fake-indexeddb. Vendored runtime: JSZip.

**Spec:** `docs/superpowers/specs/2026-10-30-mini-mart-studio-design.md`

## Global Constraints

- Free: no paid services, no API keys, no backend, no Apple developer account. GitHub Pages on a **public** repo (free Pages needs public; no user data is in the repo).
- No AI features. No build step: the browser loads `index.html` + `src/**/*.js` directly.
- Palette tokens: red `#CC2229`, cobalt `#0A4F9E`, sky `#67B1CD`, cream `#FBF7EA`, yellow `#F3C324`.
- Fonts: Hello Goops (display), Talina (UI), system (small text). Logo wordmark `SARAS_MINIMART_LOGO FINALS-02.png`; app icon from `sarasminimart_logo_in Circle.png`.
- Copy: "Aisle"/"A1…", "▶ Open the store", "■ Close store", "Basket", "🧾 Check out", "Receipt", "✓ Checked out", nudge banners "SNAP IT!" / "SCREENSHOT IT!", tip "⌘⇧4 on the Mac → AirDrop → tap +", button "Save photos + copy caption".
- Nudge default 10 min, settable 5–30. Banner auto-dismisses after 10 s or on next capture.
- Export photos: center crop to 4:5, 1080×1350 JPEG, no overlays. Videos unedited, in strip order.
- Storage warning threshold: >90% used.
- Backup filename: `<aisle-slug>-YYYY-MM-DD.zip` containing media + `notes.txt`.
- Target: iPhone Safari, installed to Home Screen.

## Review Focus

1. **Storage full mid-save** (esp. a long video): the user expects an error toast, the session to stay open, and nothing silently lost. Test: `db.addCapture` rejects with `QuotaError` (Task 2). Session shows a toast and keeps the recorder state (Task 7 device check).
2. **Phone locks or the app is backgrounded mid-session:** when it comes back, there should be at most one nudge, not a burst of chimes. Test: `nudger.tick` after a 45-min jump fires once (Task 4).
3. **Deleting a capture that's in the receipt strip:** the strip should close the gap with no hole or crash. Test: `removeFromOrder` compacts (Task 9).
4. **Aisle names with emoji, slashes, or spaces in export filenames:** the user expects a valid, readable filename. Test: `slugify` (Task 5).
5. **A recording interrupted by backgrounding:** whatever was recorded so far should be saved, not dropped. Test: `media.js` exposes `stopAndSave` called on `visibilitychange: hidden` (Task 7 device checklist item).

---

## File Structure

```
index.html                 app shell, loads src/main.js
manifest.webmanifest       name, icons, standalone, theme colors
sw.js                      offline cache of app files
styles/brand.css           tokens, @font-face, checkered strip, buttons, cards
assets/                    fonts (talina.ttf, goops.otf), logo-wordmark.png, icon-192.png, icon-512.png
vendor/jszip.min.js        vendored JSZip
src/main.js                boot: register SW, request persistence, start router
src/router.js              hash routes → screen render fns
src/db.js                  IndexedDB wrapper (only storage touchpoint)
src/nudge.js               pure timer logic + chime/banner glue
src/crop.js                4:5 crop math + canvas → JPEG blob
src/share.js               share sheet / download fallback / clipboard
src/exporter.js            notes.txt builder, slugify, zip build
src/media.js               camera stream, photo grab, video/audio recording
src/speech.js              speech-recognition wrapper with "unsupported"
src/ui.js                  el() helper, toast(), confirm sheet, banner
src/logic.js               groupByDay, receipt ordering, insertSnippet, storageLevel
src/screens/aisles.js
src/screens/settings.js
src/screens/session.js
src/screens/basket.js
src/screens/receipt.js
tests/*.test.js
package.json, vitest.config.js
```

---

### Task 1: Scaffold, brand shell, router, PWA install

**Files:**
- Create: `package.json`, `vitest.config.js`, `index.html`, `manifest.webmanifest`, `sw.js`, `styles/brand.css`, `assets/*`, `src/main.js`, `src/router.js`, `src/ui.js`
- Test: `tests/router.test.js`

**Interfaces:**
- Produces: `parseRoute(hash: string) → { name: 'aisles'|'session'|'basket'|'receipt'|'settings', aisleId: string|null }`. Routes: `#/` → aisles, `#/settings`, `#/aisle/:id` → basket, `#/aisle/:id/session`, `#/aisle/:id/receipt`. Unknown → aisles.
- Produces: `startRouter(screens: Record<name, (root: HTMLElement, params) => void|Promise<void>>)`.
- Produces (`ui.js`): `el(tag, attrs?, ...children) → HTMLElement`, `toast(message: string, kind?: 'ok'|'warn'|'error')`, `confirmSheet(message) → Promise<boolean>`, `showBanner(text) / hideBanner()`.

- [ ] **Step 1:** `npm init -y`, then `npm i -D vitest jsdom fake-indexeddb` and `npm i jszip`. Copy `node_modules/jszip/dist/jszip.min.js` to `vendor/`. Add `"test": "vitest run"` and `"type": "module"`. `vitest.config.js`: `environment: 'jsdom'`, `setupFiles: ['fake-indexeddb/auto']`.
- [ ] **Step 2:** Copy brand assets from `../Logos!!!!` and `../fonts` into `assets/` (wordmark resized to 600px wide; circle logo resized to 192 and 512 icons with `sips -Z`).
- [ ] **Step 3: Write failing test** `tests/router.test.js`:
  ```js
  expect(parseRoute('')).toEqual({ name: 'aisles', aisleId: null })
  expect(parseRoute('#/aisle/abc')).toEqual({ name: 'basket', aisleId: 'abc' })
  expect(parseRoute('#/aisle/abc/session')).toEqual({ name: 'session', aisleId: 'abc' })
  expect(parseRoute('#/aisle/abc/receipt')).toEqual({ name: 'receipt', aisleId: 'abc' })
  expect(parseRoute('#/settings').name).toBe('settings')
  expect(parseRoute('#/nope').name).toBe('aisles')
  ```
- [ ] **Step 4:** `npm test` → FAIL (module not found).
- [ ] **Step 5:** Implement `src/router.js`, `src/ui.js`, `src/main.js` (stub screens that render their name), `index.html` (viewport-fit=cover, apple-mobile-web-app-capable, apple-touch-icon, theme-color cream), `styles/brand.css` (tokens + `.checker` strip as a repeating-linear-gradient of sky/white 12px squares, red pill buttons with 3px darker drop shadow as in mockups), `manifest.webmanifest` (`display: standalone`, `start_url: "./"`, relative paths so it works under a Pages subpath), `sw.js` (cache-first for a hard-coded app-file list. Bump `CACHE_VERSION` on every release).
- [ ] **Step 6:** `npm test` → PASS. `npx serve .` and open in a desktop browser: cream page, wordmark, stub routes switch on hash change.
- [ ] **Step 7:** Commit `feat: scaffold PWA shell, brand styles, router`.

### Task 2: Data layer (`db.js`)

**Files:** Create `src/db.js`. Test `tests/db.test.js`.

**Interfaces (all async):**
- `openDb()` with stores `aisles`, `captures` (index `aisleId`), `notes` (index `aisleId`), `drafts` (key `aisleId`), `settings` (single key `'settings'`).
- `createAisle(name) → aisle`: `number` = max existing number + 1 (archived included), `archived:false`, `checkedOut:false`, `lastMode:'hands-on'`.
- `listAisles({ archived = false }) → aisle[]` sorted by `updatedAt` desc. `getAisle(id)`. `updateAisle(id, patch)`.
- `addCapture({ aisleId, kind: 'photo'|'video'|'import', blob, mime }) → capture` (`starred:false`, `receiptOrder:null`, and bumps the aisle's `updatedAt`).
- `listCaptures(aisleId)`, `updateCapture(id, patch)`, `deleteCapture(id)` (also deletes notes with that `captureId`).
- `addNote({ aisleId, captureId = null, text = '', audioBlob = null })`, `listNotes(aisleId)` oldest first, `updateNote(id, patch)`.
- `getDraft(aisleId) → string` (default `''`), `saveDraft(aisleId, caption)`.
- `getSettings() → { nudgeMinutes: 10, snippets: [] }` merged over the stored value, `saveSettings(patch)`.
- Errors: a `QuotaExceededError` from IDB is rethrown as `class QuotaError extends Error` (exported).

- [ ] **Step 1: Failing tests:** aisle numbering (`A1`, `A2`, and a third after archiving #2 is `3`), listAisles excludes archived, addCapture bumps aisle `updatedAt`, deleteCapture removes linked notes, settings defaults `{nudgeMinutes:10,snippets:[]}`, draft round-trip, and **QuotaError**: stub `IDBObjectStore.prototype.add` to throw `new DOMException('', 'QuotaExceededError')`, then `await expect(addCapture(...)).rejects.toBeInstanceOf(QuotaError)`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement with raw IndexedDB promisified (no library). Generate ids with `crypto.randomUUID()`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: IndexedDB data layer`.

### Task 3: Deploy + on-device capability spike

Proves the riskiest browser APIs on Sara's iPhone **before** building screens on them.

**Files:** Create `spike.html` (temporary; deleted in Task 10).

- [ ] **Step 1:** `spike.html` has buttons that each report ✅/❌ in a list: getUserMedia (rear camera, request 3840×2160, report actual track settings), MediaRecorder video (report `mimeType` chosen from `['video/mp4','video/webm']` via `isTypeSupported`), MediaRecorder audio, `webkitSpeechRecognition`/`SpeechRecognition` presence + a 5 s live test, Wake Lock, `navigator.share` with a generated JPEG file (`canShare({files})`), `navigator.clipboard.writeText`, `navigator.storage.persist()` result, and `navigator.storage.estimate()`.
- [ ] **Step 2 (Sara):** Create a free GitHub account if needed, then run `gh auth login`.
- [ ] **Step 3:** `gh repo create mini-mart-studio --public --source . --push`, then enable Pages: `gh api -X POST repos/{owner}/mini-mart-studio/pages -f "source[branch]=main" -f "source[path]=/"`. Expected: `https://<user>.github.io/mini-mart-studio/` loads the shell.
- [ ] **Step 4 (Sara, on iPhone):** Open the URL in Safari → Share → Add to Home Screen → open from the icon → go to `spike.html` → tap every button. Paste or screenshot the results back.
- [ ] **Step 5:** Record results in `docs/device-capabilities.md`. **Decision gate:** if speech recognition is ❌ in home-screen mode, `speech.js` (Task 7) ships as the "unsupported" stub. If `canShare({files})` is ❌, the Receipt uses the download fallback as primary. If video `mimeType` is mp4, use `.mp4` extensions everywhere. Otherwise use `.webm`.
- [ ] **Step 6:** Commit `chore: device capability spike results`.

### Task 4: Nudges (`nudge.js`)

**Files:** Create `src/nudge.js`. Test `tests/nudge.test.js`.

**Interfaces:**
- `createNudger({ intervalMs, now = Date.now }) → { start(), tick() → boolean, reset(), stop() }`. `tick()` returns `true` iff a nudge is due. On fire, the next due time is `now() + intervalMs` (not `due + intervalMs`), so a long gap fires **once**. `reset()` pushes the due time to `now() + intervalMs` (called on every capture).
- `playChime()`: two-note Web Audio blip (≈880 Hz then 1320 Hz, 120 ms each). `unlockAudio()` must be called from the "Open the store" tap.
- `runNudges({ intervalMs, onNudge }) → stop()`: wires a `createNudger` to a 1 s `setInterval` and `visibilitychange` (tick immediately when visible).

- [ ] **Step 1: Failing tests** with a fake clock: no fire before 10 min, fires at 10 min, fires again at 20 min, `reset()` at 9 min delays the fire to 19 min, and **after a jump from 0 to 45 min, `tick()` is true once and then false until 55 min**.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: nudge timer with catch-up protection`.

### Task 5: Crop, share, export

**Files:** Create `src/crop.js`, `src/share.js`, `src/exporter.js`. Test `tests/crop.test.js`, `tests/exporter.test.js`.

**Interfaces:**
- `cropRect(w, h, ratio = 4/5) → { sx, sy, sw, sh }`: largest centered rect with that ratio. `cropToJpeg(blob, { width: 1080, height: 1350, quality: 0.9 }) → Promise<Blob>` via `createImageBitmap` + canvas.
- `slugify(name) → string`: lowercase, emoji/punctuation removed, spaces/slashes → `-`, collapsed, trimmed, and `'aisle'` if empty.
- `buildNotesTxt({ aisle, notes, caption }) → string`: header `Aisle A{number} · {name}`, one line per note `YYYY-MM-DD HH:mm  {text or "(voice note, no text)"}`, then a blank line, `CAPTION DRAFT`, and the caption.
- `mediaFilename(capture, index) → string`: `{NN}-{kind}.{ext}` with `NN` zero-padded from 01 and `ext` from mime (`jpg`/`png`/`mp4`/`webm`/`m4a`).
- `exportAisle(aisleId) → Promise<void>`: builds the zip (`media/`, `voice/`, `notes.txt`) with `window.JSZip` and shares/downloads it as `${slugify(name)}-${YYYY-MM-DD}.zip`.
- `shareFiles(files: File[]) → Promise<'shared'|'cancelled'|'downloaded'>`: uses `navigator.share({files})` when `canShare` allows. `AbortError` → `'cancelled'`. Otherwise a download link per file. `copyText(text) → Promise<boolean>`.

- [ ] **Step 1: Failing tests:** `cropRect(4000,3000)` → `{sx:800, sy:0, sw:2400, sh:3000}`. `cropRect(1080,1920)` → `{sx:0, sy:285, sw:1080, sh:1350}`. `slugify('Floor mural 🎨 / v2')` → `'floor-mural-v2'`. `slugify('🎨🎨')` → `'aisle'`. `buildNotesTxt` with one text note, one voice-only note, and caption `'hi'` matches the exact expected string. `mediaFilename({kind:'video',mime:'video/mp4'}, 2)` → `'03-video.mp4'`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement. Add `<script src="vendor/jszip.min.js">` to `index.html`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: 4:5 crop, share helpers, aisle export`.

### Task 6: Aisles + Settings screens

**Files:** Create `src/logic.js` (first functions), `src/screens/aisles.js`, `src/screens/settings.js`. Test `tests/logic.test.js`.

**Interfaces:**
- `storageLevel(usage, quota) → 'ok'|'warn'`: `'warn'` when `usage/quota > 0.9`, and `'ok'` if quota is falsy.
- `clampNudgeMinutes(n) → integer in [5, 30]`, defaulting to 10 for NaN.
- Aisles screen: wordmark, aisle cards (badge `A{number}`, name, "{n} captures · {relative time}", "✓ checked out"), dashed "+ New aisle" (prompt for name, non-empty), "Archived" toggle, storage meter bar (yellow warning when `'warn'`: "Export and delete an old aisle to free space."), ⚙ link to settings, fixed red "▶ Open the store" (opens an aisle chooser sheet → `#/aisle/:id/session`). Tapping a card → `#/aisle/:id`.
- Settings screen: nudge minutes number input (clamped), snippets list (label + text, add/edit/delete), and a help card with the Shortcuts-automation workaround text.
- `main.js`: call `navigator.storage.persist()` once. If it resolves false, `toast('Tip: export your aisles now and then, since iPhone may clear app data.', 'warn')` once (flag in settings `persistNoticeShown`).

- [ ] **Step 1: Failing tests:** `storageLevel(91,100)`='warn', `storageLevel(90,100)`='ok', `storageLevel(5,0)`='ok'. `clampNudgeMinutes(2)`=5, `(45)`=30, `(12.6)`=13, `(NaN)`=10.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement the logic, then the two screens using `db.js` and `ui.js`.
- [ ] **Step 4:** `npm test` → PASS. In a desktop browser: create 2 aisles, archive one, change the nudge to 3 (shows 5), and add a snippet.
- [ ] **Step 5:** Commit `feat: aisles home and settings`.

### Task 7: Session screen (camera, recording, voice notes, nudges)

**Files:** Create `src/media.js`, `src/speech.js`, `src/screens/session.js`.

**Interfaces:**
- `media.js`: `startCamera(videoEl) → Promise<MediaStream>` (rear camera, ideal 3840×2160). `grabPhoto(videoEl) → Promise<Blob>` (JPEG 0.92 at track resolution). `startRecording(stream, kind: 'video'|'audio') → { stopAndSave(): Promise<Blob> }` using the mime chosen in Task 3. `stopCamera(stream)`.
- `speech.js`: `isSpeechSupported() → boolean`. `startTranscribe(onText: (text) => void) → stop()`. Never throws; errors resolve to no text.
- Session screen per spec §2: header with the aisle name, elapsed `m:ss`, "■ Close store". The ✋/💻 toggle persists to `aisle.lastMode`.
  - Hands-on: tap shutter = `grabPhoto` → `addCapture(kind:'photo')`. Pointer held >300 ms = video until release. Hold 🎙 = audio + transcription → `addNote`. Small flash and thumbnail on save.
  - Screen: `<input type=file accept="image/*" multiple>` → one `addCapture(kind:'import')` per file. Tip line. "🎙 Add a note" (hold for voice, or tap for a text sheet). Thumbnails of this session's adds.
  - Nudges: `unlockAudio()` on entering. `runNudges` with settings minutes. On nudge, `playChime()` + `showBanner('SNAP IT!' | 'SCREENSHOT IT!')`, hidden after 10 s or on capture (capture also calls `nudger.reset()`).
  - Wake Lock requested on entry and re-requested on `visibilitychange: visible`.
  - On `visibilitychange: hidden` during a recording, call `stopAndSave()` and store it.
  - Any `QuotaError` → `toast("Couldn't save, your phone storage is full. Export and delete an old aisle.", 'error')`. Stay on screen.
  - Camera/mic `NotAllowedError` → card: "Camera is off for Mini Mart Studio. Turn it on in Settings → Safari → Camera." with a button to switch to Screen mode.
  - Close store → stop the camera, nudges, and wake lock → `#/aisle/:id`.

- [ ] **Step 1:** Implement `media.js`, `speech.js` (stub if Task 3 said ❌), and the screen.
- [ ] **Step 2:** `npm test` → still PASS (no regressions). Push to Pages and bump `CACHE_VERSION`.
- [ ] **Step 3 (Sara, on iPhone, home-screen app):** Verify: photo saves, a 5 s held video saves and plays, a voice note saves (and transcribes if supported), the nudge set to 5 min chimes with the banner, the screen stays awake, locking the phone mid-video still saves the clip, screen-mode import of 3 AirDropped screenshots works, and denying the camera shows the card.
- [ ] **Step 4:** Commit `feat: capture session with nudges and voice notes`.

### Task 8: Basket screen

**Files:** Add to `src/logic.js`. Create `src/screens/basket.js`. Add to `tests/logic.test.js`.

**Interfaces:**
- `groupByDay(captures, notes) → Array<{ day: 'YYYY-MM-DD', captures: capture[], notes: note[] }>`: newest day first, items within a day oldest first, local time zone.
- Screen: red Goops title (aisle name), "TODAY · N items in basket" / `MMM D` day labels, a 3-col grid (▶ badge for video, ★ for starred), notes inline under their day. Tap → full-screen viewer: ★ toggle, note edit (text, and replay audio if present), delete (confirmSheet "Delete this capture?"), video/audio playback. Aisle menu: Rename, Archive, Export (`exportAisle`). Blue "🧾 Check out" → receipt.
- Delete must also call `removeFromOrder` (Task 9) on the remaining starred captures if the deleted one had a `receiptOrder`.

- [ ] **Step 1: Failing test:** captures on Oct 28 and two on Oct 30 + a note on Oct 28 → two groups, `[0].day === '2026-10-30'` with 2 captures in time order, `[1].notes.length === 1`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement `groupByDay` and the screen.
- [ ] **Step 4:** `npm test` → PASS. Check on desktop with captures made via Screen-mode import.
- [ ] **Step 5:** Commit `feat: basket timeline`.

### Task 9: Receipt screen

**Files:** Add to `src/logic.js`. Create `src/screens/receipt.js`. Add to `tests/logic.test.js`.

**Interfaces:**
- `receiptStrip(captures) → capture[]`: starred captures, those with `receiptOrder` first (ascending), then starred-without-order by `createdAt`. Excludes captures with `receiptOrder === -1` (dropped from this post but still starred).
- `moveInOrder(strip, from, to) → Array<{id, receiptOrder}>` and `removeFromOrder(strip, id) → Array<{id, receiptOrder}>`: return the patches so orders are contiguous `0..n-1`. For `removeFromOrder`, the removed id gets `-1`.
- `insertSnippet(text, cursor, snippet) → { text, cursor }`: inserts with a single space separator when needed (no double spaces), and the cursor ends after the snippet.
- Screen per spec §4: receipt card on a sky background, Goops "RECEIPT", "{NAME} · {n} ITEMS", a draggable strip (pointer events, long-press to drag, ✕ to drop), "YOUR NOTES" list (oldest first, voice-only notes show "🎙 voice note"), caption textarea (`saveDraft` debounced 500 ms), snippet chips → `insertSnippet`, and the cobalt "Save photos + copy caption" button.
  - Save: photos → `cropToJpeg`. Imports are cropped the same way. Videos pass through. Name files with `mediaFilename` in strip order → `shareFiles`. Then `copyText(caption)` → toast "Caption copied, paste it in Instagram ✓". Then `confirmSheet('Mark this aisle as checked out ✓?')` → `updateAisle(id,{checkedOut:true})`.
  - Empty strip → the button is disabled with the hint "★ some shots in your basket first".

- [ ] **Step 1: Failing tests:** `receiptStrip` ordering (two ordered + one unordered starred + one unstarred + one dropped → 3 items, in order). `moveInOrder` 0→2 on three items gives orders `[b0,c1,a2]`. **`removeFromOrder` of the middle of three → remaining `[0,1]`, removed `-1`**. `insertSnippet('love this', 9, '#wip')` → `'love this #wip'` cursor 14. `insertSnippet('love this ', 10, '#wip')` → `'love this #wip'`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement the logic and the screen.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5 (Sara, on iPhone):** Star 4 shots including 1 video, reorder, drop one, add a snippet, then Save → the share sheet → "Save 3 items". Photos in Photos are 1080×1350 and the caption pastes into Instagram.
- [ ] **Step 6:** Commit `feat: receipt packaging`.

### Task 10: Release polish + full device checklist

**Files:** Delete `spike.html`. Modify `sw.js` (final file list, bump version). Create `README.md` (install steps + how to update + backup advice).

- [ ] **Step 1:** Delete the spike, update the SW cache list, and bump the version. `npm test` → PASS.
- [ ] **Step 2:** Push and confirm Pages serves the new version (`curl -s https://<user>.github.io/mini-mart-studio/sw.js | grep CACHE_VERSION`).
- [ ] **Step 3 (Sara, on iPhone):** Run the spec's manual checklist end to end in airplane mode after first load (offline launch), including Export → the zip opens in Files with `media/`, `voice/`, `notes.txt`.
- [ ] **Step 4:** Commit `chore: v1 release`.
