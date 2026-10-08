# Hifz Class Tracker

Classroom attendance and break tracker for hifz teachers. Pure client-side app — by default, all data stays in the browser's local storage on each device, no backend, no accounts. An optional cloud sync feature (below) can back a class up online.

## Live app

- **Web app / PWA:** https://rfydawood.github.io/hifz-class-tracker/
  Open on any tablet, then "Add to Home Screen" for an installable, offline-capable app. This is the recommended way to install — no security prompts, always up to date automatically.

## Using the app: the tabs along the bottom (since 3.8; Profile and My classes since 4.0)

- **Log** - today's class: the header (its title is the open class's name), the student tiles and "Out right now". The app always opens here. Its ☰ menu has the day's actions only: start each of today's whole-class breaks, end/resume/start class, Change today's times, Attendance today, Day summary, Today's log.
- **Reports** - charts and numbers, read-only from the cloud: Whole class or One student; Today, Yesterday, This week (Monday to today), Last week, Last month; Total or Daily average. Cards for class time, time out of class (with the change against the previous period), breaks, over the limit and attendance; "Minutes out" stacked bars (with a "vs last week" tick and a Most out sort); "Where the time went" donut; "Worth a look". Export CSV is here. Breaks under 15 seconds are ignored as mis-taps, and Assigned (excused) time is not counted as time out.
- **Roster** - the class list in roll order with each student's week so far; Add, Remove, Put back. Tap a student for their report.
- **Settings** - the open class's **Schedule** (usual day, any weekday that differs, one-off dates), break limits, and Reset the day.
- **Profile** (the initials circle) - your name, Google sign-in and sync, Sign out, Download a backup (every class), the version line, and **My classes**.

**One class is open at a time (since 4.0).** Log, Reports, Roster and Settings only ever show the open class. Profile → My classes lists your classes; **Open** switches (if the open class is running, it asks first, marks anyone out back in and ends it - it can be resumed later that day). **+ Add a class** takes three steps (name and times, students - typed or copied from another class, break limits). Classes can be renamed and archived (never deleted) from the "…" menu; archived ones come back with Restore.

**Different times on different days (since 4.0).** Each class has a usual day; a weekday can differ (e.g. early dismissal on Fridays) and a single date can differ (with a note). A date beats its weekday, which beats the usual day. Whole-class breaks are named (Snack, Lunch and recess, Jumu'ah...), and each gets its banner and Start/End when it's due. When today isn't the usual day, a banner on Log says how. Each day saves the times it actually had when class starts, so changing the schedule later never changes old reports.

The chevron at the right end of the bar tucks it away (remembered on that device); a small handle in the bottom-right corner brings it back. The Log tab shows a gold count of students out while you're on another tab, red when anyone is past their limit.

## Native Android app (optional)

A fully native Android app, built with [Capacitor](https://capacitorjs.com/) (`capacitor-app/`), for teachers who want it to look like a Play Store–style app. The web app's HTML/CSS/JS is bundled directly inside the app at build time and runs in a plain WebView — no browser chrome, no address bar, no install-time website verification of any kind.

- **Firebase App Distribution** (installs through a Google-provided installer flow): https://console.firebase.google.com/project/hifz-class-tracker-dece7/appdistribution

**This replaced an earlier version built as a Trusted Web Activity** (a thin wrapper that loaded the live site, via [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap), in `android-app/`). That approach required a "digital asset links" file to live at the true root of the `rfydawood.github.io` domain to open without a browser address bar — but this project only controls the `/hifz-class-tracker/` subpath of that domain, not the root, so verification could never fully succeed there for free. `android-app/` is kept only for reference and is no longer built or distributed.

**Trade-off of going fully native:** unlike the old wrapper, this app's content is bundled at build time, so a code change no longer shows up automatically — it needs a new build pushed to Firebase App Distribution (see "Rebuilding the native app" below). The web app / PWA above is unaffected and still updates instantly.

## Cloud sync (Google accounts)

Every class lives in Firestore from the moment it's set up (see `IMPLEMENTATION_PLAN.md` Phase 2). The app still works fully offline (Firestore's local cache queues writes and flushes them on reconnect); there just isn't a separate localStorage copy competing with it.

- Since 3.7 (Phase 4 Part A, `docs/phase-4.md`) a class belongs to a **Google account**. A new install starts with **Sign in with Google**; the class is saved to that account, and signing in with the same account on any other device opens the same live class. Profile → **Sign-in and sync** shows who is signed in, and **Sign out**.
- Installs from before 3.7 were anonymous. They keep working as they are, and Profile offers **Sign in with Google**, which *links* the account to the same user - nothing is moved.
- The old **sync code** (e.g. `AB3XQ-7KLMN`) is still the class's id in the cloud, but it no longer grants access to anything: the rules let in active members only. Becoming a member means creating the class, or claiming an invite sent to your own verified Google email (used for the handover described in `docs/phase-4.md` A4; teacher invites are Part B).
- Backend: Firebase project `hifz-class-tracker-dece7`, Firestore (`firestore.rules` - an `orgs/{orgId}` tree per class, `users/{uid}` listing each account's classes; `firestore.indexes.json` - the invites email index), Firebase Auth with the Google provider (and Anonymous, still enabled for pre-3.7 installs - never disable it). Deploy with `firebase deploy --only firestore --project hifz-class-tracker-dece7`.
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

The current build/version is shown on the Profile tab in the app itself (`vN.N.N · build <id>`), so "which build is this tablet on?" is answerable by looking at the screen.

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

## Rolling back

Only if 4.0 has to be taken back. Nothing about it deletes or moves data, so going back is safe: 3.8 only ever opens the first class (`classes/default`) and reads its settings from `org.defaults`, which 4.0 keeps writing for that class. Extra classes, and the `schedule` saved on days, are simply not seen by 3.8. The rules don't need rolling back - 4.0 only *added* `schedule` to what a day may hold.

**Native app.** Android won't install an older versionCode over a newer one, so the way back is the 3.8 code built again as **versionName "3.8.1"** with a versionCode one above 4.0's (4.0 is 20, so **21**). Same signing key as always.

```
cd C:\dev\hifz-class-tracker
git worktree add ..\hifz-rollback v3.8          # the 3.8 code, beside the repo
cd ..\hifz-rollback
git switch -c rollback-3.8.1
git cherry-pick 504011d                        # 3.8's version-line fix: the app then shows its versionName
# edit capacitor-app/android/app/build.gradle:  versionCode 21,  versionName "3.8.1"
npm ci
npm run build                                  # stamps v3.8.1 into the app
cd capacitor-app
npm ci
npx cap sync android
cd android
set JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot
gradlew.bat assembleRelease
# zipalign + apksigner exactly as in "Release checklist" above, with ..\..\..\hifz-class-tracker\android-app\android.keystore
firebase appdistribution:distribute <signed.apk> --app 1:726082000637:android:5627f387c8f7218644d094 --project hifz-class-tracker-dece7 --groups hifz-testers --release-notes "3.8.1 - back to 3.8 for now"
git -C ..\..\..\hifz-class-tracker tag -a v3.8.1 <the commit the build came from> -m "3.8.1 - back to 3.8 for now"
```
Commit the versionCode/versionName change on that `rollback-3.8.1` branch before building, so the tag points at exactly what was built; afterwards `git worktree remove ..\hifz-rollback`.

**Website.** Revert the 4.0 commit(s) on `main` (`git revert <commit>...`), push, then rebuild Pages and wait for "built":
```
gh api -X POST repos/rfydawood/hifz-class-tracker/pages/builds
gh api repos/rfydawood/hifz-class-tracker/pages        # until "status":"built"
```
Until the website is released with 4.0, it is still 3.8 and nothing needs doing there.
