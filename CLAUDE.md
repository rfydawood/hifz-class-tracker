# Hifz Class Tracker — project context

Classroom attendance/break tracker for a hifz teacher (Rafaye's contact: rfy.dawood@gmail.com). Free, no-backend web app, plus an optional native Android wrapper. Non-technical user — explain things in plain language, avoid jargon, keep responses short, do the work rather than describing how to do it.

## Live things

- **Web app (primary, recommended install method):** https://rfydawood.github.io/hifz-class-tracker/ — "Add to Home Screen" on a tablet installs it as a PWA, works offline.
- **GitHub repo:** rfydawood/hifz-class-tracker (public; `gh` CLI already authenticated as this account on this machine). Hosted via GitHub Pages, **legacy branch-based deploy — pushes to `main` do NOT auto-rebuild the Pages site.** After every push that should go live, run:
  ```
  gh api -X POST repos/rfydawood/hifz-class-tracker/pages/builds
  ```
  then poll `gh api repos/rfydawood/hifz-class-tracker/pages` until `"status":"built"` before telling the user it's live.
- **Native Android app (secondary distribution):**
  - GitHub Release APK: https://github.com/rfydawood/hifz-class-tracker/releases/latest
  - Firebase App Distribution (more reliable install than raw APK — goes through Play's installer): https://console.firebase.google.com/project/hifz-class-tracker-dece7/appdistribution
  - It's a Trusted Web Activity (Bubblewrap) wrapper that just loads the live site — pushing site changes updates it automatically, no rebuild needed *unless* the app's name/icon/native permissions change.

## Firebase project

- Project ID: `hifz-class-tracker-dece7` (console: https://console.firebase.google.com/project/hifz-class-tracker-dece7/overview)
- Firebase CLI on this machine is already logged in (`rfy.dawood@gmail.com`) — most `firebase` commands just work, pass `--project hifz-class-tracker-dece7` when a command needs it.
- Contains: an Android app registration (`com.hifztracker.app`, for App Distribution) and — check current state, may have been added after this file was written — a Firestore database + Anonymous Auth for an opt-in "class code" cloud sync feature (see index.html's `save()`/`load()`/`saveProfile()`/`loadProfile()` for how storage is wired; it was deliberately centralized through those functions so swapping backends doesn't require rewriting the app).
- Note: this Google account was brand new to Google Cloud/Firebase, which caused several one-time manual console clicks (accepting ToS, first-time project creation) that the CLI couldn't do on its own. Those are done now and shouldn't recur, but if a *new* Google Cloud/Firebase resource type is provisioned for the first time and the CLI gets a bare 403/permission error, that's likely why — a one-time manual console visit fixes it.

## Local machine setup (already installed, don't reinstall)

- Node.js, JDK 17 (Microsoft Build, `C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot`), Android SDK (`C:\Users\Rafaye\android-sdk`) — all installed via winget/npm for building the Android app.
- `@bubblewrap/cli` installed globally; config at `~/.bubblewrap/config.json` points at the JDK/SDK above.
- Android signing key: `android-app/android.keystore` + password in `android-app/KEYSTORE_PASSWORD_KEEP_SAFE.txt` — **both gitignored, local only, never commit.** Needed only to rebuild/re-sign the native app. If lost, the app can never be updated under the same identity again — back these up somewhere private outside git.

## Repo layout

- `index.html` — the entire web app (no build step, no framework)
- `manifest.json`, `sw.js`, `icons/` — PWA support
- `.well-known/assetlinks.json` — lets the native app open full-screen (no browser address bar)
- `android-app/` — native wrapper project source (buildable; see its own notes / README.md for rebuild steps)
- `make_icons.py` — regenerates app icons if the design changes
- `README.md` — human-facing summary of the above (keep it updated alongside this file when things change)

## Working conventions established so far

- Git commits end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` — match existing `git log` style.
- Each teacher's data is independent per device by default (localStorage) — this must stay true unless the user explicitly asks to change it.
- Prefer free tooling/hosting for everything; flag clearly any time something would cost money (e.g. Google Play Store's one-time $25 fee) rather than assuming it's wanted.
- User prefers autonomous execution over back-and-forth — make the call and do it, only pausing for things only they can authorize (e.g. clicking "accept" on their own Google account, providing tester emails).
