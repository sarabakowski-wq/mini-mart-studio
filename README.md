# Sara's Mini Mart Studio

A phone app for documenting your art process and turning it into Instagram posts.

- **Aisles:** one per project.
- **Open the store:** a work session. The camera is ready (✋ Hands-on), or you add AirDropped Mac screenshots (💻 Screen). A chime and a "SNAP IT!" banner nudge you every few minutes.
- **Basket:** everything you captured, by day, with your notes. ★ the good ones.
- **Check out → Receipt:** order your ★ shots, write the caption next to your notes, and save 4:5 photos + copy the caption.

Everything is saved **only on your phone**. Nothing is uploaded.

## Put it on your iPhone (one time)

1. Make a free account at [github.com](https://github.com) if you don't have one.
2. On github.com, click **+ → New repository**. Name it `mini-mart-studio`, set it to **Public**, and don't add any files. Click **Create**.
3. In Terminal, from this folder, run the two commands GitHub shows under "…or push an existing repository" (they start with `git remote add origin` and `git push`).
4. On github.com, open the repo → **Settings → Pages**. Under "Branch", pick `main` and `/ (root)`, then click **Save**. After a minute, the page shows your link: `https://YOUR-NAME.github.io/mini-mart-studio/`.
5. On your iPhone, open that link in **Safari** → tap **Share** → **Add to Home Screen**.
6. Always open Mini Mart from the home-screen icon (that's what makes it an app, keeps your data safe, and lets it work offline).

The code is public, but your photos and notes are not. They never leave your phone.

## First run checklist (on the iPhone, from the home-screen icon)

- [ ] Make an aisle and open the store. Allow the camera.
- [ ] Tap the shutter: the photo appears in the strip.
- [ ] Hold the shutter for ~5 s: a video saves and plays in the Basket.
- [ ] Hold 🎙 and say a sentence: the note saves (and shows your words if speech-to-text works).
- [ ] Set the nudge to 5 min in ⚙ Settings, start a session, and wait: you hear the chime and see the banner.
- [ ] The screen stays on during a session.
- [ ] Lock the phone mid-video: the clip up to that point is saved.
- [ ] 💻 Screen mode → + → pick a few AirDropped screenshots.
- [ ] Deny the camera once (Settings → Safari → Camera → Deny): you see the friendly card.
- [ ] ★ some shots → Check out → reorder → Save: the share sheet → **Save Images**. Photos are 4:5, and the caption pastes into Instagram.
- [ ] Aisle menu ⋯ → Export: the .zip saves to Files.
- [ ] Turn on Airplane Mode and open the app: it still works.

Tell Claude which ones fail (screenshots help).

## Updating the app

After changes, bump `CACHE_VERSION` in `sw.js`, commit, and `git push`. Close and reopen the app on your phone (sometimes twice) to get the new version.

## Backups

Your phone is the only copy. Use **⋯ → Export backup** on each aisle now and then, and keep the zips in iCloud Drive.

## For developers

Plain HTML/CSS/JS, no build step. `npm install`, then `npm test` (Vitest). Serve locally with `python3 -m http.server`. The camera needs HTTPS or localhost.
