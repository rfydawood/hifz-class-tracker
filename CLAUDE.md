# Hifz Class Tracker — project context

Classroom attendance/break tracker for a hifz teacher (Rafaye's contact: rfy.dawood@gmail.com). Free, no-backend web app, plus an optional native Android wrapper. Non-technical user — explain things in plain language, avoid jargon, keep responses short, do the work rather than describing how to do it.

## Live things

- **Web app (primary, recommended install method):** https://rfydawood.github.io/hifz-class-tracker/ — "Add to Home Screen" on a tablet installs it as a PWA, works offline.
- **GitHub repo:** rfydawood/hifz-class-tracker (public; `gh` CLI already authenticated as this account on this machine). Hosted via GitHub Pages, legacy branch-based deploy from `main`. **A push to `main` DOES start a Pages build on its own** (seen 2026-10-06: pushing 4.0 put it on the website for ~30 s before it was reverted) - so anything pushed to `main` goes live; to hold a release back from the website, don't push it to `main` (use a branch). After every push that should go live, also run:
  ```
  gh api -X POST repos/rfydawood/hifz-class-tracker/pages/builds
  ```
  then poll `gh api repos/rfydawood/hifz-class-tracker/pages` until `"status":"built"` before telling the user it's live.
- **Native Android app (secondary distribution):** `capacitor-app/` — a fully native Capacitor app (plain WebView, content bundled at build time). Distributed via Firebase App Distribution: https://console.firebase.google.com/project/hifz-class-tracker-dece7/appdistribution
  - **Release notes + tags:** every distributed build is tagged `v<versionName>` (annotated, message = the release notes) on the commit it was built from. At each release, unless the user supplies notes, write them yourself from `git log <last v* tag>..HEAD` (and the diff if commit messages are unclear): one line, plain English for a teacher, in the style "3.6 - minutes stepper for every break; over-limit flags fixed; reports fit the tablet; Reset day asks first" - user-visible changes only, no test/docs/refactor noise. Pass them via `--release-notes`, show them in the final report, then `git tag -a v<version> <built commit> -m "<notes>"` and `git push origin v<version>`, then publish it on GitHub with `gh release create v<version> --verify-tag --title "<version>" --notes "<notes>"` (notes only - do not attach the APK, the repo is public).
  - **Testers:** always distribute with `--groups hifz-testers` (the "Hifz testers" group in App Distribution) so every tester gets each release - add new testers with `firebase appdistribution:testers:add <email> --group-alias hifz-testers --project hifz-class-tracker-dece7`. Do not use `--testers` with a single email.
  - **Unlike the web app, this does NOT auto-update.** A code change requires a rebuild + `firebase appdistribution:distribute` to reach testers. See README.md "Rebuilding the native app" for the exact steps. Bump `versionCode`/`versionName` in `capacitor-app/android/app/build.gradle` each time.
  - `android-app/` (Bubblewrap/Trusted Web Activity) is the **abandoned first attempt** — kept for reference, never build or distribute from it again. It failed because Digital Asset Links verification requires `assetlinks.json` at the true root of `rfydawood.github.io`, which this project doesn't control (only the `/hifz-class-tracker/` subpath) — confirmed via Google's own verification API rejecting the subpath. Symptom was: installed app fell back to a browser view with an address bar, and Chrome's own PWA-install prompt fired on top of it (looked like "opens and asks to install again").
  - The Capacitor app reuses the **exact same signing key** as the old TWA (`android-app/android.keystore`) so it installs as a clean in-place upgrade, not a conflicting second app. Never generate a new keystore for this app.

## Firebase project

- Project ID: `hifz-class-tracker-dece7` (console: https://console.firebase.google.com/project/hifz-class-tracker-dece7/overview)
- Firebase CLI on this machine is already logged in (`rfy.dawood@gmail.com`) — most `firebase` commands just work, pass `--project hifz-class-tracker-dece7` when a command needs it.
- Contains: an Android app registration (`com.hifztracker.app`, for App Distribution; the release key's SHA-1 and SHA-256 are registered on it for Google sign-in, and `capacitor-app/android/app/google-services.json` is its public config), a Firestore database and Firebase Auth (Google provider, plus Anonymous kept enabled for installs from before 3.7 - never disable it). Every class lives under `orgs/{orgId}` (personal accounts = an org of one; plan section 2.2), and `users/{uid}` lists the classes a Google account can open. Since Phase 4 Part A (`docs/phase-4.md`) a class belongs to a Google account: new devices sign in with Google, older anonymous installs link to Google keeping the same uid, and the sync code (the org id, still shown nowhere important) grants nothing - `firestore.rules` admits active members only. All Firestore access goes through the named writer functions in index.html (`writeAttendance`, `writeBreakStart`/`writeBreakEnd`, `writeSessionAndAttendance`, `writeRosterStudent`, `writeSettings`) and realtime listeners (`attachListeners`/`attachDayListeners`) — never a blanket save(). Test rules against the emulator (`npm run test:rules`) before deploying.
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

## App layout: tabs (since 3.8)

`index.html` has tabs along the bottom (`showTab()`; Log, Reports, Roster, Settings, and since 4.0 Profile (`drawProfile()`/`paintProfile()`: account, backup, version, My classes); `.app[data-tab]` picks the visible section): **Log** (the original screen - header, tiles, "Out right now"; the app always opens here; its ☰ drawer, `drawDrawer()`, keeps only the day's actions), **Reports** (`drawReports()` fetches, `paintReports()` draws; read-only - `loadDays()` = bounded `fetchDayRange()` + `snapshot()` for today, for the period and the previous one; counting rules live in `crunch()`/`classMinutes()`: breaks under 15 s ignored, `assigned` is never "time out", bad session times cleaned against class hours; charts are hand-built SVG, no library), **Roster** (`drawRoster()`/`paintRoster()`, this week's numbers per student) and **Settings** (`drawSettings()`). The bar can be tucked away (`setTabsHidden()`, Store key `ui.tabsHidden` - in the hydrate list; `keepClearOfHandle()` keeps tiles out from under the corner handle). The Log tab's badge (`updateLogBadge()`) runs from `tick()` and only reads state. Break-type colours are fixed: washroom #eb6834, water #2a78d6, wudhu #1baf7a, other #eda100, assigned #e87ba4. Layout is checked in `tests/layout.spec.mjs` at the real tablet's 805x504 and 533x781.

## Classes and schedules (since 4.0)

- **One class open at a time.** `CLASS_ID` (a variable now, saved in Store key `session.classId`, reopened at boot, falling back to `'default'` if missing or archived) is the open class. Log, Reports, Roster and Settings only ever read/write the open class; another class's data never appears in them. Switching (`switchClass()`) detaches listeners, clears day/report/roster state, paints from that class's cache and re-attaches. Everything stays inside the teacher's own personal org - this is NOT Phase 4 Part B (no invites, roles or schools).
- **Data.** Classes are `orgs/{orgId}/classes/{classId}` with `name, teacherUid, settingsOverride, status ('active'|'archived')`. The first class is `'default'` and its data never moved; new class ids are Firestore auto-ids. Nothing is deleted - archive/restore only.
- **Settings are merged on read, never migrated** (`computeSettings()` = `mergeSettings(org.defaults + class.settingsOverride)`). `settingsOverride` is written only when the teacher changes a setting or adds a class (`writeSettings()` replaces it whole with `update`). The `'default'` class **also** keeps mirroring its usual day (startTime/endTime/snack/lunch) and limits to `org.defaults`, so an older app version on another device still works - keep that.
- **Schedule:** `settings.schedule = {usual, days:{1..7}, dates:{'YYYY-MM-DD'}}` + `settings.classDays`; `scheduleFor(date)` = date || weekday || usual. A class with no schedule gets `usual` built in memory from the legacy fields (never written back). Each day doc saves the times it had as `schedule` (on start, resume, or a change while running); reports use `day.schedule || scheduleFor(date)`. `firestore.rules` allows `schedule` on days (the only 4.0 rules change).
- **Writers fix the class and day at the tap** (`writeDay`, `writeBreak*`, `writeRosterStudent` capture `CLASS_ID`/day id), so held or in-flight writes always land in the class they were made in. `tracked()` counts belong to the open class (`inflightGen`). New writers: `writeClass` (class + students, one batch), `writeClassMeta` (rename/archive/restore), `writeMyName`.
- **Delete forever (4.0.1)** is the only real delete: archived classes only, by the org's admin (`firestore.rules` `deletesArchivedClass()` reads the class's status, so `writeDeleteClass()` deletes breaks, days and students first and the class doc last). The app never deletes the open class, and never the first class while it is the only one (rules can't count; archiving already needs another class open). If the open class disappears, `openFallbackClass()` opens the first active class.
- **Break limits (4.0.1)** are − / + steppers: minutes 1-30, trips 1-10 or "No limit", stored as `trips: 99` (`NO_TRIP_LIMIT`) - not 0 or null - so older app versions, which compare trips used against the number, never flag a trip for it. Always go through `tripCap()`.
- Instant-paint cache per class: `cacheKey(cid)` - `'cache.lastClass'` for `'default'` (unchanged), `'cache.lastClass.<id>'` for others (hydrated before use).
- `README.md` → "Rolling back" has the exact way back to 3.8 (rebuild v3.8 as 3.8.1, versionCode above 4.0's).

## Phase 4 status

Part A (Google sign-in, rules that close the sync-code hole) shipped in 3.7
on 2026-09-27 - see the status section in `docs/phase-4.md`. Part B
(schools: teacher invites, roles / admin mode) is ON HOLD as of
2026-10-02 - the owner asked to hold off on it. Don't start or suggest it
unless they bring it back up. It was built and tested on 2026-10-03 before
being put on hold, and never released: its code, rules and tests are in
commits ec2016b and aad9808, reverted by 3a9a65c. If the owner brings it
back, revert 3a9a65c on a new branch and follow "Part B status" in
`docs/phase-4.md`. Until then, new work builds on the personal-class app.

## Working conventions established so far

- **Fresh backup before risky updates only.** Before starting an update, require a backup - a `hifz-backup-*.json` saved in the last 24 hours in `C:\Users\Rafaye\Downloads` - only if the update:
  - changes `firestore.rules`,
  - changes how data is stored or read (Firestore paths or fields, the writer functions, listeners, settings merging, caches/Store keys, migration, backup/restore), or
  - can delete data.
  If one is required and none is there, stop before changing anything and ask the owner to download one from the website (Profile → Backup → Download a backup). Never commit that file or any name from it. For an update that only changes screens, wording or layout, skip the check, and say in the final summary that no backup was needed (and why).
- **Always push to GitHub yourself after any change, without being asked.** The user is non-technical and explicitly said they'll forget to ask and will assume local edits are already live. Every change = commit + push + trigger a Pages rebuild + confirm it's actually live (see the `gh api ... pages/builds` step above) — never leave a change sitting local-only, and never wait for the user to say "push it."
- Git commits end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` — match existing `git log` style.
- **As of Phase 2, Firestore is the source of truth, not localStorage.** A device's class lives in the cloud from the moment it's set up (see the Firebase project note above); localStorage/Preferences only hold a durable session pointer and an instant-paint cache. Don't reintroduce a local mirror that competes with Firestore, and don't add a Firestore write inside `render()` or `tick()` — every write goes through a named writer function, on a real user action.
- Prefer free tooling/hosting for everything; flag clearly any time something would cost money (e.g. Google Play Store's one-time $25 fee) rather than assuming it's wanted.
- User prefers autonomous execution over back-and-forth — make the call and do it, only pausing for things only they can authorize (e.g. clicking "accept" on their own Google account, providing tester emails).
- Before changing `firestore.rules`, test against the emulator (`npm run test:rules`) before `firebase deploy --only firestore:rules`. Before changing the live data flow in index.html, run the Playwright suite (`npm run test:e2e`, needs the Firestore + Auth emulators - the script starts and stops them itself via `firebase emulators:exec`).
