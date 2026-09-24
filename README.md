# Hifz Class Tracker

Classroom attendance and break tracker for hifz teachers. Pure client-side app — by default, all data stays in the browser's local storage on each device, no backend, no accounts. An optional cloud sync feature (below) can back a class up online.

## Live app

- **Web app / PWA:** https://rfydawood.github.io/hifz-class-tracker/
  Open on any tablet, then "Add to Home Screen" for an installable, offline-capable app. This is the recommended way to install — no security prompts, always up to date automatically.

## Native Android app (optional)

A fully native Android app, built with [Capacitor](https://capacitorjs.com/) (`capacitor-app/`), for teachers who want it to look like a Play Store–style app. The web app's HTML/CSS/JS is bundled directly inside the app at build time and runs in a plain WebView — no browser chrome, no address bar, no install-time website verification of any kind.

- **Firebase App Distribution** (installs through a Google-provided installer flow): https://console.firebase.google.com/project/hifz-class-tracker-dece7/appdistribution

**This replaced an earlier version built as a Trusted Web Activity** (a thin wrapper that loaded the live site, via [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap), in `android-app/`). That approach required a "digital asset links" file to live at the true root of the `rfydawood.github.io` domain to open without a browser address bar — but this project only controls the `/hifz-class-tracker/` subpath of that domain, not the root, so verification could never fully succeed there for free. `android-app/` is kept only for reference and is no longer built or distributed.

**Trade-off of going fully native:** unlike the old wrapper, this app's content is bundled at build time, so a code change no longer shows up automatically — it needs a new build pushed to Firebase App Distribution (see "Rebuilding the native app" below). The web app / PWA above is unaffected and still updates instantly.

## Cloud sync (sync codes)

Every class lives in Firestore from the moment it's set up — this isn't optional anymore (see `IMPLEMENTATION_PLAN.md` Phase 2). The app still works fully offline (Firestore's local cache queues writes and flushes them on reconnect); there just isn't a separate localStorage copy competing with it.

- Setting up a class creates a private, randomly generated **sync code** (e.g. `AB3XQ-7KLMN`) shown in the teacher menu → **Sync**. This is the class's id in the cloud.
- On another device, entering that same code (teacher menu → Sync → "Enter your sync code" on first launch, or "Switch to that code" from an existing class) attaches that device to the same live class — changes on either device appear on the other within seconds.
- **The code is the only "password."** There's no separate login — anyone who has the exact code can read and write that class's data, the same way anyone with a shared link could. Codes are long, random, and never listable/guessable from outside, but they should still be kept as private as a password.
- Backend: Firebase project `hifz-class-tracker-dece7`, Firestore (`firestore.rules` in this repo — an `orgs/{orgId}` tree per personal account, access gated on a real per-device membership document, not listable), Anonymous Authentication (silent, one identity per device/install — Google Sign-In is a later phase). Both were provisioned via `firebase deploy --only firestore,auth` — see `firebase.json`.
- Test rule changes against the emulator before deploying: `npm run test:rules`. Test the live sync/offline behavior itself with `npm run test:e2e` (Playwright; starts and stops the Firestore + Auth emulators itself).

## Repo layout

- `index.html` — the entire app (HTML/CSS/JS, no build step)
- `manifest.json`, `sw.js`, `icons/` — PWA support (installability + offline)
- `vendor/firebase/` — the Firebase SDK files the app loads, committed here so the native app never needs a CDN at startup
- `scripts/build.mjs` — stamps a version/build id into `index.html`/`sw.js` and copies the canonical files into `capacitor-app/www/`. Run via `npm run build`. This is the **only** way `capacitor-app/www/` should be updated — never hand-edit or hand-copy into it, that's what caused web fixes to silently never reach the tablet.
- `firebase.json`, `firestore.rules` — cloud sync backend config (see above)
- `capacitor-app/` — the current native Android app (Capacitor). Buildable from scratch; `node_modules/`, Gradle build output, and the built APK are intentionally **not** committed. `capacitor-app/www/` **is** committed — it's the build script's output, kept in git so a CI check can catch drift (see below)
- `android-app/` — the earlier Trusted Web Activity native wrapper (Bubblewrap). Legacy/reference only — no longer built or distributed (see above)
- `make_icons.py` — regenerates the app icons if the design ever changes

## Build pipeline and drift gate

`capacitor-app/www/` used to be a hand-maintained copy of the root files, which drifted silently and cost a multi-hour debugging session. Now it's generated:

```
npm run build     # stamp version/build id, copy index.html/sw.js/manifest.json/icons/vendor into capacitor-app/www/
npm run verify    # same, then fails if the result differs from what's committed (beyond the build timestamp)
```

A GitHub Action (`.github/workflows/verify.yml`) runs `npm run verify` on every PR and on pushes to `main` — if someone edits `index.html` and forgets to run `npm run build` before committing, CI fails.

The current build/version is shown at the bottom of the teacher menu in the app itself (`vN.N.N · build <id>`), so "which build is this tablet on?" is answerable by looking at the screen.

## Release checklist

**Web (updates instantly, no build needed by users):**
1. `npm run build` (stamps the new version/build id into `index.html` and `sw.js`, and refreshes `capacitor-app/www/` to match)
2. Commit and push to `main`
3. Trigger a Pages rebuild (legacy branch-based deploy, pushes alone don't rebuild it):
   ```
   gh api -X POST repos/rfydawood/hifz-class-tracker/pages/builds
   ```
4. Poll `gh api repos/rfydawood/hifz-class-tracker/pages` until `"status":"built"` before telling anyone it's live.

**Native (does NOT auto-update — every tablet needs this pushed to it):**

The signing key (`android-app/android.keystore`, reused for the Capacitor app too so updates install cleanly over old installs) and its password are kept **local only**, never committed — anyone with them could push updates under this app's identity. They're backed up outside git; ask Rafaye if a rebuild is needed on a new machine. **A cloud agent cannot produce an installable native build** — this step always requires the owner's machine.

```
npm run build                      # refreshes capacitor-app/www/ from the canonical source
cd capacitor-app
npx cap sync android
cd android
./gradlew.bat assembleRelease
# then zipalign + apksigner sign app-release-unsigned.apk with ../../android-app/android.keystore
# (see android-app/KEYSTORE_PASSWORD_KEEP_SAFE.txt), then
# firebase appdistribution:distribute <signed.apk> --app 1:726082000637:android:5627f387c8f7218644d094 --project hifz-class-tracker-dece7 --groups hifz-testers
```
Remember to bump `versionCode`/`versionName` in `capacitor-app/android/app/build.gradle` each time.
