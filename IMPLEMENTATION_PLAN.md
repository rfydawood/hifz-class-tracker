# Implementation plan: one app, one database, native-first

**Goal.** The native Android app and the website become two front doors to the *same* live data — the Netflix model. A change made on the tablet shows up on the website and vice versa, without anyone typing a code. The native app is the primary target; the website is the fallback for people who don't want to install anything.

**Scope note.** This is an MVP for the author and their teaching team. Real per-user authentication is explicitly out of scope for now, but every decision below must leave a clean seam for it later.

**Who this is for.** An implementing agent (Claude Code) working in `rfydawood/hifz-class-tracker`. Read this whole file before touching code.

---

## 1. Current state — verified facts

Read these before planning edits; line numbers are from `index.html` at the time of writing.

| Thing | Where | Current behaviour |
|---|---|---|
| Entire web app | `index.html` (~1020 lines) | Single file, no build step, no framework |
| Profile storage | `saveProfile()` / `loadProfile()` L355–365 | `localStorage['hifz.guest.profile']` = `{teacher, setup, students, settings}` |
| Today's state | `save()` / `load()` L366–381 | `localStorage['hifz.guest.day']` = `{day, state}`, restored only when `day === todayKey()` |
| Day archive | `readHistory()` / `writeHistory()` L791–792, `archive()` L804 | `localStorage['hifz.tracker.history']` = `{ 'YYYY-MM-DD': snapshot }` — **local only, never synced** |
| Class code | `classCode()` / `setClassCode()` L402–403 | `localStorage['hifz.guest.classcode']` |
| Cloud push | `cloudSync()` L433–444 | Debounced 1500 ms, writes `classes/{code}` = `{profileJSON, dayJSON, updatedAt}` — two whole-document JSON strings |
| Cloud pull | `pullFromCloud()` L458+ | **Manual only**, button-triggered. No listener, no pull at boot |
| Firebase SDK | L286–288 | compat v10.14.1 loaded from `gstatic.com` CDN |
| Auth | `initCloud()` L415 | Anonymous auth |
| Native app | `capacitor-app/` | Capacitor 8, `webDir: "www"`, content **bundled at build time** |
| Native web assets | `capacitor-app/www/` | **Hand-copied** from repo root — drifted badly and silently |
| Rules | `firestore.rules` | Locks the doc to exactly `profileJSON`, `dayJSON`, `updatedAt` |

---

## 2. Root problems to fix (not patch)

1. **Two separate databases.** Website localStorage and native WebView localStorage are different storage buckets. There is no shared source of truth.
2. **Cloud writes are whole-blob, last-write-wins.** `profileJSON` / `dayJSON` are entire-state JSON strings. Two devices active at once silently clobber each other wholesale.
3. **No realtime sync.** No `onSnapshot` anywhere. Data only moves cloud-ward, and only pulls when a human taps a button.
4. **Session identity is not durable.** The class code lives in WebView `localStorage`, which on Android can be cleared, and — critically — **`capacitor.config.json` does not pin `androidScheme`**, so the WebView origin follows the Capacitor default. If that default changes across a Capacitor upgrade, the origin changes and *every* localStorage key silently vanishes. This is the most likely cause of "I lose my data whenever the app shuts down and have to re-enter the sync code."
5. **History never syncs.** Reports/archive are local-only, so the website shows none of the tablet's history.
6. **Persistence is coupled to rendering.** `render()` ends with `tick(); save();` (L1008) and `tick()` can call `render()` every second (L1014). Harmless against localStorage; **catastrophic against Firestore** — it would mean a write per second per device, burning the free tier and racking up cost. Persistence must be driven by actual state changes, never by paint.
7. **Native app depends on a CDN at startup.** Firebase loads from `gstatic.com`. On a flaky classroom network the native app has no cloud layer at all. For an offline-first native app this must be bundled locally.
8. **`capacitor-app/www/` is a manual copy.** This caused a multi-hour debugging session where four correct web fixes never reached the tablet. Must become a generated, drift-proof artifact.
9. **No visible build identity.** Nothing in the UI says which build a device is running, so "is this device updated?" is unanswerable without a debugger.

---

## 3. Target architecture

### 3.1 Source of truth

**Firestore, offline-first.** Every client reads and writes Firestore. Firestore's own persistent local cache provides offline reads, queued offline writes, and automatic flush on reconnect. This *replaces* the hand-rolled localStorage mirror — do not keep both as competing sources of truth.

Enable persistent cache at init (compat API):
```js
firebase.firestore(fbApp).enablePersistence({ synchronizeTabs: true })
```
Handle `failed-precondition` (multiple tabs) and `unimplemented` (unsupported browser) by continuing without persistence rather than crashing.

### 3.2 Data model

Decompose the two blobs into documents that merge cleanly. `classId` replaces today's "class code" as the identifier (same human-facing code string is fine as the doc id).

```
classes/{classId}
    schemaVersion: 2
    name: string                 // "Hafiz Abdur Rafaye's Hifz Class"
    teacherName: string
    settings: { startTime, endTime, snack{start,end}, lunch{start,end}, longMin,
                limits: { washroom{min,trips}, water{...}, wudhu{...} } }
    createdAt, updatedAt: timestamp

classes/{classId}/students/{studentId}
    name: string
    active: bool
    order: number                // preserves the teacher's roll order
    createdAt: timestamp

classes/{classId}/days/{YYYY-MM-DD}
    date: 'YYYY-MM-DD'
    session: { status, startedAt, endedAt, lunchAt, pauseLabel, resumeAt }
    attendance: { [studentId]: { status, at, note } }
    updatedAt: timestamp

classes/{classId}/days/{YYYY-MM-DD}/breaks/{breakId}
    sid, reason, startAt, endAt, dur, over, flag, overTrip, assignedMin
```

Why this shape:
- **Per-student docs** mean adding/removing a student never rewrites the whole roster, so two devices editing the roster merge instead of clobbering.
- **Per-break docs** mean two teachers logging breaks simultaneously both succeed. Break logging is the highest-frequency concurrent action in a real classroom.
- **Day docs replace both** `hifz.guest.day` *and* `hifz.tracker.history`. History becomes a Firestore query, so reports sync everywhere for free. This kills problem #5 outright.
- `attendance` stays a map on the day doc (bounded by roster size, written as field-level updates: `attendance.${sid}`).

### 3.3 Realtime sync

Attach listeners once a class is active; detach on class switch.

| Listener | Scope |
|---|---|
| `classes/{classId}` | profile + settings |
| `classes/{classId}/students` | roster |
| `classes/{classId}/days/{today}` | session + attendance |
| `classes/{classId}/days/{today}/breaks` | active and completed breaks |

Do **not** subscribe to all history — reports should do a bounded `get()` over the requested range (`where(date >= start, date <= end)`), served from cache when offline.

Snapshot handlers must be idempotent and must not fight local state: apply incoming data into `state`, then `render()`. Use `snapshot.metadata.hasPendingWrites` to skip echo of your own optimistic write.

### 3.4 Write discipline — mandatory

Delete `save()` from the end of `render()`. Persistence becomes explicit:

- Every real mutation (tap a student, start a break, end class, edit roster, change settings) calls a small, named writer — `writeBreak()`, `writeAttendance()`, `writeSession()`, `writeSettings()` — that writes **only the changed fields**.
- Debounce coalescable writes (settings sliders, text edits) ~500–1000 ms. Do not debounce discrete events (break start/stop) — write immediately so other devices see them fast.
- Never write from `tick()`, and never write from `render()`.
- Optimistic local update first, then write; Firestore's cache makes this feel instant and survives offline.

Acceptance: an idle app with a class open performs **zero** Firestore writes per minute.

### 3.5 Session persistence — "stay logged in"

Introduce a storage adapter with two backends:

```js
// storage.js concept - one interface, platform-appropriate backend
Store.get(key) / Store.set(key, value) / Store.remove(key)
  native (Capacitor):  @capacitor/preferences   -> Android SharedPreferences
  web:                 localStorage
```

Use Capacitor's runtime check (`window.Capacitor?.isNativePlatform?.()`) to pick the backend. Install `@capacitor/preferences` at the major version matching Capacitor core (8.x).

Why Preferences and not localStorage on native: SharedPreferences survives WebView data clears and is immune to the WebView-origin change described in problem #4. This is what makes it behave like "logged into the Claude app."

Persist under these keys:
- `session.classId` — the active class
- `session.deviceId` — random uuid, useful for debugging and later auth
- `cache.lastClass` — small last-known-good snapshot (class name, roster) purely for instant first paint before Firestore's cache warms

**Boot sequence:**
1. Read `session.classId`.
2. If absent → show the chooser (below).
3. If present → paint immediately from `cache.lastClass`, attach listeners, render as data arrives. **Never** show the setup screen when a `classId` exists.

**Class chooser** (replaces today's forced setup screen) offers:
- *Create a new class* → generate id, write profile doc, run existing setup flow to seed roster
- *Use an existing class code* → validate the id exists, then attach
This is only ever seen on a truly fresh install or after an explicit "Switch class".

**Teacher menu additions:** "Switch class", "Sign out of this class" (clears `session.classId` only, never cloud data), and the class code shown for copying.

Also pin the origin so this can never regress:
```json
// capacitor.config.json
{ "appId": "com.hifztracker.app", "appName": "Hifz Class Tracker", "webDir": "www",
  "server": { "androidScheme": "https" } }
```
Changing this value later would orphan WebView storage — treat it as frozen.

### 3.6 Anonymous auth

Keep anonymous auth for now (rules require `request.auth != null`). Sign in before any Firestore work and await it at boot. UID churn is tolerable under current rules; when real auth lands, the seam is: `classes/{classId}.members[uid] = role`, and rules check membership instead of "any signed-in user with the code."

---

## 4. Build and release pipeline

This is Phase 0 because it prevents a repeat of the failure that started this work.

1. **Single canonical source.** Repo root `index.html` / `sw.js` / `manifest.json` / `icons/` remain canonical.
2. **Generated native assets.** Add `scripts/build.mjs` (plain Node, no bundler, no framework):
   - copies canonical files into `capacitor-app/www/`
   - stamps `APP_VERSION` (from `package.json` or a `VERSION` file) and a build timestamp into a `<meta>` tag / global constant in both copies
   - fails loudly if a canonical file is missing
3. **npm scripts** at repo root: `npm run build` (stamp + copy), `npm run verify` (re-run build, fail if the working tree changes — i.e. drift check).
4. **CI drift gate.** GitHub Action on PR: run `npm run verify`. A PR where `capacitor-app/www/` is stale fails. Drift becomes structurally impossible.
5. **Version visible in the UI.** Show `APP_VERSION` + build date in the teacher menu footer. "Which build is this tablet on?" must be answerable by looking at the screen.
6. **Release checklist** in `README.md` — web deploy (push to `main`, trigger Pages build, confirm `"status":"built"`) and native (`npm run build`, bump `versionCode`/`versionName` in `capacitor-app/android/app/build.gradle`, `npx cap sync android`, assemble + sign with the **existing local keystore**, `firebase appdistribution:distribute`).

**Hard constraint:** the signing keystore is local-only and gitignored by design. A cloud agent cannot produce an installable native upgrade. Any change intended for the tablet requires a local rebuild + App Distribution push by the owner.

### 4.1 Bundle Firebase locally

Vendor the three compat SDK files into `vendor/firebase/` and reference them relatively, so the native app has no CDN dependency at startup. Keep the version pinned and noted in `README.md`.

---

## 5. Migration (must not lose existing data)

On first boot of the new version, if `session.classId` is unset:

1. Look for legacy keys `hifz.guest.classcode`, `hifz.guest.profile`, `hifz.guest.day`, `hifz.tracker.history` in **both** backends (localStorage and Preferences).
2. If a legacy class code exists → adopt it as `classId`.
   If not, but a legacy profile exists → create a new class and seed from it.
3. Upload anything not already in Firestore:
   - profile → `classes/{id}` (+ `students/*` from the roster array, preserving order)
   - `hifz.tracker.history` entries → `days/{date}` docs (+ `breaks/*`)
   - today's `hifz.guest.day` → today's day doc
4. Write `session.classId`, set a `migratedAt` marker, and **leave legacy keys in place** (do not delete) for one release, as a safety net.
5. Guard with `schemaVersion` on the class doc so migration is idempotent and never double-runs.

Also: keep `backupAll()` / `restoreBackup()` working, updated to the new model — it is the only escape hatch if cloud sync ever misbehaves.

---

## 6. Firestore rules

Current rules hard-code the three blob fields and must be rewritten for the new model. MVP posture stays "the code is the secret", but tightened:

- `classes/{classId}`: `get`/`write` if `request.auth != null`; validate `schemaVersion`, types, and field whitelist; cap string lengths; `list` and `delete` stay `false`.
- `classes/{classId}/students/{id}` and `days/{date}` (+ `days/{date}/breaks/{id}`): same auth condition; validate shapes; allow `list` **within a class** (needed for roster and report queries) but never across classes.
- Keep the catch-all `match /{document=**} { allow read, write: if false; }`.
- Leave a commented block showing the membership-based rule that real auth will switch to.

Test rules with the Firestore emulator before deploying (`firebase emulators:start --only firestore`), and deploy with `firebase deploy --only firestore:rules --project hifz-class-tracker-dece7`.

---

## 7. Phased delivery

Each phase must be independently shippable and leave the app working.

**Phase 0 — pipeline & identity** *(no user-visible behaviour change)*
Build script, drift gate in CI, version stamp in UI, pin `androidScheme`, vendor Firebase SDK.
*Done when:* CI fails on drift; the teacher menu shows a build version; the native app starts with no network.

**Phase 1 — durable session**
Storage adapter (Preferences on native, localStorage on web); persist `session.classId`; boot straight into the class; class chooser replaces the forced setup screen; "Switch class" in the menu.
*Done when:* force-closing and reopening the tablet app goes straight to the class with no code entry, repeatedly, including after an app update.

**Phase 2 — Firestore as source of truth**
New data model, offline persistence, realtime listeners, write-discipline refactor (remove `save()` from `render()`).
*Done when:* a change on the website appears on the tablet within seconds and vice versa; an idle app performs zero writes/minute; airplane mode still allows full use, and changes flush on reconnect.

**Phase 3 — history & migration**
Day docs power reports; migrate legacy local data; backup/restore updated.
*Done when:* reports on the website show days recorded on the tablet; an existing device upgrades with zero data loss.

**Phase 4 — rules & hardening**
New rules + emulator tests; conflict-resolution polish; error/offline indicators in the UI.
*Done when:* rules tests pass; the UI clearly shows "offline — changes will sync" instead of silently failing.

---

## 8. Testing requirements

- **Two-client sync test** (Playwright, two browser contexts against the same `classId`): mutate in A, assert it appears in B. Cover roster edit, break start/stop, attendance change, settings change.
- **Offline test:** `context.setOffline(true)`, perform mutations, go online, assert flush and convergence.
- **Cold-start test:** fresh context with only `session.classId` set → asserts the class loads and the setup screen never appears.
- **Migration test:** seed legacy localStorage keys (including `hifz.tracker.history`), boot, assert Firestore contents and that no data is lost.
- **Write-count test:** instrument the Firestore write path with a counter; assert zero writes during 60 s idle.
- **Rules tests:** Firestore emulator — unauthenticated denied; authenticated with wrong class id cannot read; `list` across `classes` denied.
- **Native smoke test:** after a real rebuild, on the tablet — force-close/reopen 3× and confirm it lands straight in the class each time.

Chromium is available for Playwright at `/opt/pw-browsers/chromium-*/chrome-linux/chrome`; serve the app with a plain static server for tests.

---

## 9. Do not

- Do not introduce a framework (React/Vue/etc.), a bundler, or TypeScript. The app stays a single hand-written HTML file plus a trivial Node copy/stamp script. The owner is non-technical; build complexity is a real cost.
- Do not redesign the UI. Visual changes in this work are limited to: class chooser, "Switch class" menu entry, sync/offline indicator, version stamp.
- Do not break offline use. Offline-capable in a classroom with bad wifi is a hard requirement, not a nice-to-have.
- Do not keep localStorage as a parallel source of truth once Firestore lands — one source of truth, plus a tiny paint cache.
- Do not generate a new Android signing key, and never commit the keystore.
- Do not delete legacy localStorage keys in the same release that migrates them.
- Do not let anything reintroduce `save()` inside `render()`.

---

## 10. Known gotchas

- **Firestore free tier (Spark):** ~50k reads / 20k writes per day. Fine at this scale *if* write discipline holds; trivially blown by a write-per-render.
- **Timestamps:** `serverTimestamp()` reads back `null` locally until the server round-trips. Guard every date conversion; the existing code already revives dates in `load()` — keep that defensive habit.
- **Day rollover:** the day doc id is derived from local date. Decide and document one rule (local device date is correct for a classroom) and make the today-listener re-subscribe at midnight.
- **Echo suppression:** use `metadata.hasPendingWrites` to avoid re-applying your own writes and causing render churn.
- **Capacitor upgrades:** re-verify `androidScheme` after any Capacitor major bump — a silent change orphans all stored data.
- **`android:allowBackup="true"`:** Android auto-backup can restore stale app data onto a reinstalled device. With Firestore as source of truth this is mostly harmless, but it can resurrect an old `session.classId` — make the boot path tolerate a `classId` that no longer exists (fall back to the chooser, don't crash).
- **The native app does not auto-update.** Every fix intended for the tablet needs a local rebuild and an App Distribution push. Assume any tablet report is about an older build until the version stamp proves otherwise.
