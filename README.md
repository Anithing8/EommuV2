# Eommu

Tasks and daily schedules in one small app. It works offline, sends reminders, installs like a normal app on phones, tablets and computers, and keeps everything on your own device. No account and no server.

**Live app:** https://anithing8.github.io/EommuV2/
**Repository:** https://github.com/Anithing8/EommuV2

There are two versions that share one backup format:

| | Where | What it is |
|---|---|---|
| Web app | the root of this repository | Installable PWA, plain HTML, CSS and JavaScript. Hosted on GitHub Pages |
| Android app | [`android/`](android) | Native Kotlin app (Jetpack Compose) |

## What it does

**Tasks**
- Add tasks inline. New tasks always go to the end of their list, so the order is the order you added them.
- Round checkbox, priority star, collapsible notes with clickable links, source link chips and a Capture dialog for things that come from email or chat.
- Two levels: tasks and subtasks. Completing a task completes its subtasks. Tab and Shift+Tab, or the Indent buttons, change the level.
- **Swipe a task to the left to delete it** (touch screens). A short swipe shows a Delete key you tap. A swipe past half the row deletes at once. Both offer Undo. Sideways swipes on a task never move the board to another list, and vertical movement only scrolls.

**Lists and the board**
- Several lists side by side. The default list cannot be deleted.
- Four sort modes per list: My order, Due date, Starred recently, Title A–Z.
- **Lists for a day:** give a list a date. Its tasks that have no date of their own show on the calendar on that day, in Today & overdue and in Quick focus. A task's own date always wins.
- Today & overdue, Starred / priority, and a Completed drawer with Delete all completed.
- Move a task to another list by dragging it, or from its details.

**Time**
- Due date and clock time, repeats (every N days, weeks on chosen weekdays, months, years) with an end date or a number of repeats. Finishing a repeating task creates the next one.
- Overdue tasks are marked **Past due** until you finish them or change the date.
- Reminders at the clock time: an in-app alert with Mark done, plus a system notification.
- Day and 7-day calendar with an all-day row and hourly slots. Drag a task to another day or hour.

**Presets (daily schedules)**
- Save a routine once and copy it to today in one click, from the top bar, the sidebar or a list.
- Copy to another date with a checklist of which items to include.
- Three ways to handle duplicates: skip ones already there (default), fresh daily reset, or append all.
- Auto-copy every day at a rollover time on the days you choose. Save any list as a preset.

**Everything else**
- Quick focus widget with a progress bar, a sidebar mode (375 px panel), keyboard shortcuts (arrows, Space, S, Tab, Ctrl+Shift+P, Delete), light, dark and system themes, print styles.
- Export and import a JSON backup.

## Put it online with GitHub Pages

1. Put the files of this repository in the repository root (`index.html` must be at the top level).
2. Open **Settings → Pages**. Under **Build and deployment** choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
3. After a minute the app is live at https://anithing8.github.io/EommuV2/.

Open it once while online. From then on it also opens with no connection.

Only these are needed on the site: `index.html`, `sw.js`, `manifest.webmanifest`, `icons/` and `.nojekyll`. The rest (`src/`, `tools/`, `android/`) is source and does no harm if it is also uploaded.

## Install it like an app

- **Android (Chrome):** menu → Install app.
- **iPhone and iPad (Safari):** Share → Add to Home Screen. iOS only allows notifications for apps added this way.
- **Windows, Mac, Linux (Chrome or Edge):** the install icon in the address bar.

## Reminders: what to expect

The web app has no server, so a notification can only appear while Eommu is open or running in the background. On Android and desktop Chrome an installed app can also be woken now and then by the browser, but how often is up to the browser. Reminders that came due while it was closed appear as a summary the next time you open it. The daily preset auto-copy works the same way: it runs the first time Eommu is open after the rollover time.

The Android app uses system alarms, so reminders arrive with the app closed and are set again after a restart.

## Your data

The web app saves in the browser of the device you use and does not sync between devices. The Android app saves in its own private storage. Use **Export backup** and **Import backup** (Settings) to move data between devices, or between the web app and the Android app. Clearing site data in the browser removes the web data, so export now and then.

## Android app

See [`android/README.md`](android/README.md). In short: open the `android` folder in Android Studio and run it, or run the **Build Android app** workflow in the Actions tab and download the APK. The Android app was written without access to an Android SDK, so the first build is the first real test; if it fails, the build log names the file and line.

## Updating the web app

Replace the files in the repository. The next time the app opens online it shows "A new version of Eommu is ready" with a Reload button.

## For developers

- `src/` holds the readable source: `logic.js` (data rules, no DOM), numbered UI scripts, `style.css`, `shell.html`, fonts.
- `python3 tools/build.py` inlines everything into the single `index.html` and writes `sw.js` with a new cache version. Python is only a development tool; GitHub Pages serves the built files and runs nothing.
- Tests: `node tools/test-logic.js` for the data rules. `node tools/e2e.js <dir>`, `e2e2.js` and `e2e3.js` drive the built app in Chromium (serve the repository at `http://localhost:8765/` first, for example `python3 -m http.server 8765`).
- `node tools/make-icons.js` redraws the icons (needs `sharp`).
- Type is TeX Gyre Heros, embedded as subset WOFF files (GUST Font License).

## Layout

```
index.html  sw.js  manifest.webmanifest  icons/     the deployed web app
src/                                                 web source
tools/                                               build script and tests
android/                                             Kotlin app
.github/workflows/android.yml                        builds the APK on GitHub
```
