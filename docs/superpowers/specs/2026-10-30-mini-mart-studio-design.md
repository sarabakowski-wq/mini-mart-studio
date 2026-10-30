# Mini Mart Studio — Design

**Date:** 2026-10-30
**Owner:** Sara
**Status:** Approved design, pending spec review

## Purpose

A Sara's Mini Mart–branded phone app for documenting an art process while working, then turning that process into Instagram posts. It solves four problems:

1. **Forgetting to capture** → timed nudges during a work session.
2. **Captures lost in the camera roll** → everything is filed to a project as it's taken.
3. **Remembering decisions** → quick voice/text notes attached to captures.
4. **Turning it into posts** → a packaging screen to pick, order, caption, and save.

Sara works both hands-on (physical pieces) and digitally (Illustrator etc. on a Mac). The app is used on her iPhone, in the moment.

## Constraints

- **Free.** No paid services, no API keys, no servers, no Apple developer account.
- **No AI.** Sara writes captions; the app gathers her notes next to the caption box.
- **Phone-first.** Installable web app (PWA) added to the iPhone home screen.

## Branding

Mini Mart metaphor throughout:

| App concept | Mini Mart name |
|---|---|
| Project | **Aisle** (numbered A1, A2…) |
| Work session | **Opening the store** / "Close store" to end |
| A project's captures | **Basket** |
| Post packager | **Receipt** / "Check out" |
| Finished project | **✓ Checked out** |

Palette (from logo sheet): red `#CC2229`, cobalt `#0A4F9E`, sky `#67B1CD`, cream `#FBF7EA`, yellow `#F3C324`. Cream backgrounds, red display headings, cobalt body text, sky checkered strips and borders, yellow for nudges and highlights.

Fonts (from `Sara's Mini Mart/fonts`): **Hello Goops** for display headings, **Talina** for UI text, system font for small/secondary text. Logo: `Logos!!!!/SARAS_MINIMART_LOGO FINALS-02.png` (wordmark) on home; circle logo as the app icon.

Reference mockups: `.superpowers/brainstorm/*/content/flow.html` and `session.html`.

## Screens

### 1. Aisles (home)
- Wordmark logo at top, list of aisles: number, name, capture count, last activity, ✓ if checked out.
- "+ New aisle" (name only).
- Archive an aisle (hidden from the main list, viewable under "Archived").
- Storage meter: space used vs. available on the device.
- Settings entry (nudge interval, saved snippets).
- Big red **"▶ Open the store"** button → choose an aisle → Session.

### 2. Session
- Header: aisle name, elapsed time, **■ Close store**.
- Toggle: **✋ Hands-on** / **💻 Screen**. Remembers the last mode used per aisle.
- **Hands-on mode:** live camera fills the screen.
  - Tap shutter = photo. Hold shutter = video while held.
  - Hold 🎙 = voice note while held.
- **Screen mode:** no camera.
  - Big "+ Add from phone" opens the photo picker (for screenshots AirDropped from the Mac). Multiple selection allowed.
  - Tip line: "⌘⇧4 on the Mac → AirDrop → tap +".
  - "🎙 Add a note" (voice or typed).
  - Thumbnails of what was added this session.
- **Nudges:** every N minutes (default 10, settable 5–30) the app plays a chime and shows a yellow banner: "SNAP IT!" (Hands-on) or "SCREENSHOT IT!" (Screen). The banner dismisses on the next capture or after 10 s.
- Screen stays awake during a session (Wake Lock, where supported).
- Nudges only work while the app is open on screen. That's an accepted limitation. Optional workaround, documented in the app's help: an iPhone Shortcuts automation that reminds Sara and opens the app.

### 3. Basket
- The aisle's captures in a 3-column grid, grouped by day (newest first), with notes shown inline under the day they were made.
- Videos show ▶; starred items show ★.
- Tap a capture → full-screen view: star/unstar, add/edit note, delete (with confirm), play video/voice.
- **🧾 Check out** button → Receipt.
- **Export** (in the aisle menu) → backup .zip (see Backup).

### 4. Receipt
- Receipt-styled card on a sky background.
- **Strip:** starred captures in a row. Drag to reorder. Tap ✕ to drop one from this post (it stays starred in the Basket).
- **Your notes:** every note in the aisle, oldest first, as a read-only list next to the caption box.
- **Caption:** text box. Draft is auto-saved per aisle.
- **Snippets:** chips for saved hashtag sets and sign-offs. Tap to insert at the cursor. Managed in Settings.
- **"Save photos + copy caption":**
  - Photos are center-cropped to 4:5 (1080×1350) and saved as JPEGs. No frames or overlays.
  - Videos are saved unedited, in strip order, as separate clips.
  - Uses the iPhone share sheet (→ "Save Images/Videos"). The caption is copied to the clipboard. A toast confirms.
- After saving, Sara is offered "Mark aisle as checked out ✓".

## Behavior details

### Voice notes
- Always saved as audio (replayable).
- Best-effort live transcription using the browser's built-in speech recognition, where the installed app supports it. The transcript becomes the note's text and can be edited. If transcription isn't available or fails, the note is saved with empty text and a "tap to type" prompt.
- **Verify early on Sara's iPhone.** If speech recognition isn't available in home-screen mode, voice notes fall back to audio + typed text with no other changes.

### Photo quality
- Hands-on photos are frames grabbed from the live camera at the highest resolution the phone offers the browser. This is lower than the native Camera app but above Instagram's 1080×1350. This tradeoff keeps Sara in the app instead of bouncing to the Camera app each shot.
- Screen-mode imports keep their original resolution.

### Storage
- Everything lives on the phone, in the browser's on-device database (IndexedDB): aisles, captures (as files), notes, caption drafts, settings.
- The app requests **persistent storage** so iOS doesn't clear it.
- Nothing is uploaded anywhere.

### Backup
- Per-aisle **Export** saves `aisle-name-YYYY-MM-DD.zip` with all photos, videos, voice notes, and a `notes.txt` (timestamped notes and the caption draft) to Files / iCloud Drive via the share sheet.
- Restore/import is **out of scope** for v1. The zip is a human-readable archive.

### Offline
- The app works fully offline after the first load (service worker caches the app files).

## Error handling

| Situation | Behavior |
|---|---|
| Camera/mic permission denied | Friendly card explaining how to allow it in iPhone Settings. Screen mode still works. |
| Storage nearly full (>90%) | Yellow warning on home + before recording video: "Export and delete an old aisle to free space." |
| Save fails (quota) | Capture is not lost silently: show an error toast and keep the session open. |
| Share sheet cancelled | No-op. Caption is still copied. |
| Share with files unsupported | Fall back to individual download links. |
| Speech recognition unavailable | Save audio, empty text, "tap to type". |
| Persistent storage denied | One-time notice recommending regular exports. |

## Architecture

Plain HTML/CSS/JavaScript (ES modules), no framework and no build step, so it's easy to read and change. Small, single-purpose modules:

| Module | Responsibility |
|---|---|
| `db.js` | IndexedDB wrapper: CRUD for aisles, captures, notes, drafts, settings. The only module that touches storage. |
| `media.js` | Camera stream, photo frame grab, video and audio recording (MediaRecorder). |
| `nudge.js` | Interval timer, chime (Web Audio), banner events. Pure timing logic is separate from DOM for testing. |
| `speech.js` | Wraps speech recognition; reports "unsupported" cleanly. |
| `crop.js` | 4:5 center-crop to 1080×1350 JPEG via canvas. |
| `share.js` | Share-sheet save with download fallback; clipboard copy. |
| `exporter.js` | Builds the backup zip (vendored JSZip). |
| `router.js` | Hash-based routing between the four screens + settings. |
| `screens/*.js` | One file per screen: `aisles`, `session`, `basket`, `receipt`, `settings`. Rendering + event wiring only; calls the modules above. |
| `styles/brand.css` | Palette tokens, fonts, checkered strip, buttons. |
| `sw.js`, `manifest.webmanifest` | Offline cache, home-screen install, icon. |

### Data model

```
aisle    { id, number, name, createdAt, updatedAt, archived, checkedOut, lastMode }
capture  { id, aisleId, kind: photo|video|import, blob, mime, createdAt, starred, receiptOrder|null }
note     { id, aisleId, captureId|null, text, audioBlob|null, createdAt }
draft    { aisleId, caption, updatedAt }
settings { nudgeMinutes, snippets: [{ label, text }] }
```

## Hosting

- Free on **GitHub Pages** (HTTPS is required for camera access and install).
- Install: open the URL in Safari → Share → "Add to Home Screen".

## Testing

- **Unit tests** (Vitest + fake-indexeddb, dev-only, free): `db.js`, nudge timing logic, crop math, receipt ordering, snippet insertion, export manifest/notes.txt contents.
- **Manual on-device checklist** on Sara's iPhone (home-screen mode): camera photo/video, voice note + transcription, nudge chime + banner, wake lock, AirDrop import, share-sheet save, clipboard, export zip, offline launch, permission-denied paths.

## Out of scope (v1)

AI captions, accounts, laptop↔phone sync, video stitching/editing, posting directly to Instagram, background push notifications, frames/stickers on exports, crop adjustment (center-crop only), backup restore.
