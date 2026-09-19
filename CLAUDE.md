# Hifz Class Tracker — project context

Classroom attendance/break tracker for a hifz teacher (Rafaye's contact: rfy.dawood@gmail.com). Free, no-backend web app, plus an optional native Android wrapper. Non-technical user — explain things in plain language, avoid jargon, keep responses short, do the work rather than describing how to do it.

## Live things

- **Web app (primary, recommended install method):** https://rfydawood.github.io/hifz-class-tracker/ — "Add to Home Screen" on a tablet installs it as a PWA, works offline.
- **GitHub repo:** rfydawood/hifz-class-tracker (public; `gh` CLI already authenticated as this account on this machine). Hosted via GitHub Pages, **legacy branch-based deploy — pushes to `main` do NOT auto-rebuild the Pages site.** After every push that should go live, run:
  ```
  gh api -X POST repos/rfydawood/hifz-class-tracker/pages/builds
  ```
  then poll `gh api repos/rfydawood/hifz-class-tracker/pages` until `"status":"built"` before telling the user it's live.
- **Native Android app (secondary distribution):** `capacitor-app/` — a fully native Capacitor app (plain WebView, content bundled at build time). Distributed via Firebase App Distribution: https://console.firebase.google.com/project/hifz-class-tracker-dece7/appdistribution
  - **Unlike the web app, this does NOT auto-update.** A code change requires a rebuild + `firebase appdistribution:distribute` to reach testers. See README.md "Rebuilding the native app" for the exact steps. Bump `versionCode`/`versionName` in `capacitor-app/android/app/build.gradle` each time.
  - `android-app/` (Bubblewrap/Trusted Web Activity) is the **abandoned first attempt** — kept for reference, never build or distribute from it again. It failed because Digital Asset Links verification requires `assetlinks.json` at the true root of `rfydawood.github.io`, which this project doesn't control (only the `/hifz-class-tracker/` subpath) — confirmed via Google's own verification API rejecting the subpath. Symptom was: installed app fell back to a browser view with an address bar, and Chrome's own PWA-install prompt fired on top of it (looked like "opens and asks to install again").
  - The Capacitor app reuses the **exact same signing key** as the old TWA (`android-app/android.keystore`) so it installs as a clean in-place upgrade, not a conflicting second app. Never generate a new keystore for this app.

## Firebase project

- Project ID: `hifz-class-tracker-dece7` (console: https://console.firebase.google.com/project/hifz-class-tracker-dece7/overview)
- Firebase CLI on this machine is already logged in (`rfy.dawood@gmail.com`) — most `firebase` commands just work, pass `--project hifz-class-tracker-dece7` when a command needs it.
- Contains: an Android app registration (`com.hifztracker.app`, for App Distribution) and, as of Phase 2 (see IMPLEMENTATION_PLAN.md), a Firestore database + Anonymous Auth that every class is backed by live — not opt-in anymore. Every device's class lives under `orgs/{orgId}` (personal accounts = an org of one; see plan section 2.2 for the schema); the "sync code" a teacher can find in the app's teacher menu → Sync is that org's id, and a second device attaches to the same live class by entering it. All Firestore access goes through the named writer functions in index.html (`writeAttendance`, `writeBreakStart`/`writeBreakEnd`, `writeSessionAndAttendance`, `writeRosterStudent`, `writeSettings`) and realtime listeners (`attachListeners`/`attachDayListeners`) — never a blanket save(). `firestore.rules` enforces per-org membership; test changes to it against the emulator (`npm run test:rules`) before deploying.
- Note: this Google account was brand new to Google Cloud/Firebase, which caused several one-time manual console clicks (accepting ToS, first-time project creation) that the CLI couldn't do on its own. Those are done now and shouldn't recur, but if a *new* Google Cloud/Firebase resource type is provisioned for the first time and the CLI gets a bare 403/permission error, that's likely why — a one-time manual console visit fixes it.

## Local machine setup (already installed, don't reinstall)

- Node.js, JDK 17 (Microsoft Build, `C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot`) — used by the legacy `android-app/` (Bubblewrap) setup, kept installed but no longer needed for new work.
- JDK 21 (Microsoft Build, `C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot`) — **use this one for `capacitor-app/`**, its Capacitor Android module requires Java 21 specifically (JDK 17 fails the build).
- Android SDK (`C:\Users\Rafaye\android-sdk`), `build-tools/36.1.0` (has `zipalign.exe`, `apksigner.bat`) — shared by both projects.
- `@bubblewrap/cli` installed globally (legacy, for `android-app/` only, not used going forward).
- Android signing key: `android-app/android.keystore` + password in `android-app/KEYSTORE_PASSWORD_KEEP_SAFE.txt` — **both gitignored, local only, never commit.** Reused for `capacitor-app/` too (same package name + cert = clean upgrades). If lost, the app can never be updated under the same identity again — back these up somewhere private outside git.

## Repo layout

- `index.html` — the entire web app (no build step, no framework)
- `manifest.json`, `sw.js`, `icons/` — PWA support
- `firebase.json`, `firestore.rules` — cloud sync backend config
- `capacitor-app/` — **current** native Android app (Capacitor, fully bundled, no auto-update — see above)
- `android-app/` — **legacy** native wrapper (Bubblewrap/TWA), abandoned, reference only
- `make_icons.py` — regenerates app icons if the design changes
- `README.md` — human-facing summary of the above (keep it updated alongside this file when things change)

## Working conventions established so far

- **Always push to GitHub yourself after any change, without being asked.** The user is non-technical and explicitly said they'll forget to ask and will assume local edits are already live. Every change = commit + push + trigger a Pages rebuild + confirm it's actually live (see the `gh api ... pages/builds` step above) — never leave a change sitting local-only, and never wait for the user to say "push it."
- Git commits end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` — match existing `git log` style.
- **As of Phase 2, Firestore is the source of truth, not localStorage.** A device's class lives in the cloud from the moment it's set up (see the Firebase project note above); localStorage/Preferences only hold a durable session pointer and an instant-paint cache. Don't reintroduce a local mirror that competes with Firestore, and don't add a Firestore write inside `render()` or `tick()` — every write goes through a named writer function, on a real user action.
- Prefer free tooling/hosting for everything; flag clearly any time something would cost money (e.g. Google Play Store's one-time $25 fee) rather than assuming it's wanted.
- User prefers autonomous execution over back-and-forth — make the call and do it, only pausing for things only they can authorize (e.g. clicking "accept" on their own Google account, providing tester emails).
- Before changing `firestore.rules`, test against the emulator (`npm run test:rules`) before `firebase deploy --only firestore:rules`. Before changing the live data flow in index.html, run the Playwright suite (`npm run test:e2e`, needs the Firestore + Auth emulators - the script starts and stops them itself via `firebase emulators:exec`).
