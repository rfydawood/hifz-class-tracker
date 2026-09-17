# Implementation plan: shared database, organizations, native-first

**Supersedes the previous version of this file.** The earlier plan put classes at the database root. Organizations are now in scope, so the schema changes at the foundation — that is why this is a rewrite rather than an amendment.

**Goal.** The native Android app and the website are two front doors to the *same* live data. A change on the tablet appears on the website and vice versa, with nobody typing a code. The native app is the primary target; the website exists so someone who won't install an app can still use everything.

**Two account shapes, one data model:**
- **Personal** — a single teacher with their own class. This is what the app does today.
- **Organization** — e.g. "Masjid Uthman Boys Full-Time Hifz": an admin sets policy and sees everything; teachers run their own classes and see only their own.

**Who this is for.** An implementing agent (Claude Code) working in `rfydawood/hifz-class-tracker`. Read this entire file before touching code.

---

## 1. Current state — verified facts

Line numbers are from `index.html` as of this writing.

| Thing | Where | Current behaviour |
|---|---|---|
| Entire web app | `index.html` (~1020 lines) | Single file, no build step, no framework |
| Profile storage | `saveProfile()` / `loadProfile()` L355–365 | `localStorage['hifz.guest.profile']` |
| Today's state | `save()` / `load()` L366–383 | `localStorage['hifz.guest.day']`, restored only when the saved day matches today |
| Day archive | L791–806 | `localStorage['hifz.tracker.history']` — **local only, never synced** |
| Class code | L402–403 | `localStorage['hifz.guest.classcode']` |
| Cloud push | `cloudSync()` L433–444 | Debounced 1500 ms; writes `classes/{code}` = `{profileJSON, dayJSON, updatedAt}` — two whole-state JSON strings |
| Cloud pull | `pullFromCloud()` L458+ | **Manual only.** No listener, no pull at boot |
| Firebase SDK | L286–288 | compat v10.14.1 from the `gstatic.com` CDN |
| Auth | L415 | Anonymous only |
| Native app | `capacitor-app/` | Capacitor 8, `webDir: "www"`, content **bundled at build time** |
| Native web assets | `capacitor-app/www/` | **Hand-copied** from the repo root — drifted silently and caused a multi-hour debugging session |
| Rules | `firestore.rules` | Locks the doc to exactly `profileJSON`, `dayJSON`, `updatedAt` |

### Problems to fix at the root — not patch

1. **Two separate databases.** Website localStorage and native WebView localStorage are different buckets. No shared truth.
2. **Whole-blob, last-write-wins writes.** Two devices active at once clobber each other's entire state.
3. **No realtime sync.** No `onSnapshot` anywhere.
4. **Session identity is not durable.** The class code lives in WebView `localStorage`, and `capacitor.config.json` **does not pin `androidScheme`** — so the WebView origin follows the Capacitor default. If that default shifts across a Capacitor upgrade, the origin changes and every localStorage key silently vanishes. This is the most likely cause of "I lose my data when the app shuts down and have to re-enter the sync code."
5. **History never syncs.** Reports are local-only.
6. **Persistence is coupled to rendering.** `render()` ends with `tick(); save();` (L1008) and `tick()` can call `render()` every second (L1014). Harmless against localStorage; **catastrophic against Firestore** — a write per second per device.
7. **Native app depends on a CDN at startup** for Firebase.
8. **`capacitor-app/www/` is a manual copy.**
9. **No visible build identity** — no way to tell which build a device is running.

---

## 2. Target architecture

### 2.1 Source of truth

**Firestore, offline-first.** Firestore's persistent cache provides offline reads, queued offline writes and automatic flush on reconnect. It *replaces* the hand-rolled localStorage mirror — do not keep both as competing sources of truth.

```js
firebase.firestore(fbApp).enablePersistence({ synchronizeTabs: true })
```
Handle `failed-precondition` (multiple tabs) and `unimplemented` (unsupported browser) by continuing without persistence rather than crashing.

**Everything in this plan runs on the Firebase free (Spark) tier.** No Cloud Functions, no Cloud Messaging, no server. Admin alerts are in-app, computed client-side. Keep it that way.

### 2.2 Schema

**Personal accounts are organizations with one member.** Do not build two models — they will drift, which is exactly the failure this project has already lived through.

```
orgs/{orgId}
    schemaVersion: 3
    name: string                        // "Masjid Uthman Boys Full-Time Hifz"
    kind: 'organization' | 'personal'   // affects UI copy only, never structure
    activeYearId: '2025-2026'
    defaults: {                          // org-wide policy, admin-controlled
      startTime, endTime,
      snack: {start,end}, lunch: {start,end},
      longMin, limits: { washroom:{min,trips}, water:{...}, wudhu:{...} },
      flagThreshold: 2                   // alert when a student hits this many flags in a day
    }
    createdAt, updatedAt

orgs/{orgId}/members/{uid}
    email: string (lowercased)
    displayName: string
    roles: ['admin'] | ['teacher'] | ['admin','teacher']   // a list, never one field
    status: 'active' | 'revoked'
    joinedAt

orgs/{orgId}/invites/{inviteId}
    email: string (lowercased)           // the match key
    roles: [...]
    code: string                         // one-time fallback code
    status: 'pending' | 'claimed' | 'revoked'
    createdBy: uid, createdAt, expiresAt

orgs/{orgId}/classes/{classId}
    name, teacherUid
    settingsOverride: { ...subset of defaults... }   // null/absent = inherit org defaults
    status: 'active' | 'archived'

orgs/{orgId}/classes/{classId}/students/{studentId}
    name, active: bool, order: number
    enrolledFrom: 'YYYY-MM-DD'
    enrolledUntil: 'YYYY-MM-DD' | null

orgs/{orgId}/classes/{classId}/days/{YYYY-MM-DD}
    date, yearId
    session: { status, startedAt, endedAt, lunchAt, pauseLabel, resumeAt }
    attendance: { [studentId]: { status, at, note } }
    roster: { [studentId]: name }        // self-contained snapshot - see below
    summary: { ... }                     // rolling aggregate - see 2.5
    updatedAt

orgs/{orgId}/classes/{classId}/days/{date}/breaks/{breakId}
    sid, reason, startAt, endAt, dur, over, flag, overTrip, assignedMin

orgs/{orgId}/dayBoard/{YYYY-MM-DD}
    acks: { [alertKey]: { by: uid, at } }    // admin-dismissed alerts
```

Why this shape:

- **Per-student and per-break documents** mean concurrent edits merge instead of overwriting. Break logging is the highest-frequency concurrent action in a real classroom.
- **Students live under the class.** They stay with one teacher until graduation and records reset yearly, so class-scoped is correct and simpler. The rare transfer is an admin action (copy to the new class, mark inactive in the old).
- **`roster` on the day doc is deliberate denormalisation and is required.** A day in September must remember who was on the roster *that day*. If reports instead join against the current roster, a student added in January appears to have attended in September, and a removed student vanishes from past days. The current code already gets this right by snapshotting names per day (`snapshot()` L797) — preserve that property.
- **`enrolledFrom` / `enrolledUntil` exist so reports don't lie.** A student who joins in January must not count as absent for September–December. Every report computes over the intersection of the report range and the student's enrolled range, and surfaces "joined 12 Jan" on their report.
- **Day docs replace both** `hifz.guest.day` *and* `hifz.tracker.history`. History becomes a Firestore query, so reports sync everywhere for free.
- **`yearId` on every day doc** is how the academic year works. Rollover changes `activeYearId` on the org — **no data is moved or deleted**. Past years remain queryable behind a "past years" option.

### 2.3 Realtime sync

Attach listeners once a class is active; detach on class switch or sign-out.

**Teacher:** the org doc, their class doc, its `students`, today's day doc, today's `breaks`.
**Admin dashboard:** the org doc, all class docs, and **today's day doc for each class** — roughly ten documents. Do *not* subscribe to every class's break subcollection; that is what `summary` is for.

Reports do a bounded `get()` over a date range (`where('yearId','==',activeYearId)` plus date bounds), served from cache when offline.

Snapshot handlers must be idempotent and must not fight local state. Use `snapshot.metadata.hasPendingWrites` to skip the echo of your own optimistic write.

### 2.4 Write discipline — mandatory

**Delete `save()` from the end of `render()`.** Persistence becomes explicit:

- Each real mutation calls a named writer — `writeAttendance()`, `writeBreak()`, `writeSession()`, `writeSettings()`, `writeRoster()` — touching only changed fields.
- Debounce coalescable writes (settings, text edits) ~500–1000 ms. Do **not** debounce discrete events (break start/stop) — other devices should see those immediately.
- Never write from `tick()` or `render()`.
- Update local state optimistically, then write.

**Acceptance: an idle app with a class open performs zero Firestore writes per minute.** Add a test that asserts this.

### 2.5 The daily summary (what makes the admin dashboard cheap)

The teacher's client already has every number locally, so it maintains a small rolling `summary` block on its own day doc as part of its normal writes. The admin then reads ~10 small documents live instead of hundreds of break records. No server, no Cloud Functions.

```
summary: {
  classStatus: 'not_started'|'in_session'|'on_break'|'ended',
  lastActivityAt: timestamp,
  enrolledCount, presentCount, absentCount, tardyCount,
  flagsByStudent: { [studentId]: count },   // ~11 entries
  inClassMs, outOfClassMs,                  // see 2.6 for the definition
  updatedAt
}
```

**The summary is for the dashboard glance only — it is not authoritative.** Any drill-down reads the actual break documents. Recompute the summary from breaks when class ends so the stored day settles on correct values.

### 2.6 The productivity metric — exact definition

The dashboard chart answers: *how much of available class time is being spent out of class?* Implement it exactly as follows; ambiguity here produces numbers nobody trusts.

**Out-of-class time** = total duration of breaks with reason `washroom`, `water`, `wudhu`, `other`.
**Excluded:** `assigned` breaks (teacher-directed, not lost time) and whole-class snack / lunch / recess (scheduled, applies to everyone).

**Available class time**, per student, for the day:
```
available = (min(now, classEnd) − classStart)
          − whole-class break time already elapsed
          − time before arrival, for a tardy student
```
- A student marked **absent** is excluded entirely from both numerator and denominator that day.
- A student not enrolled that day (per `enrolledFrom`/`enrolledUntil`) is excluded.
- On a day in progress, compute to *now* and label the figure "so far today".

**Report the percentage, not raw minutes.**
```
outOfClassPct = sum(outOfClass across students) / sum(available across students) × 100
```
A class of 12 will always accumulate more raw break minutes than a class of 10; percentage compares honestly. Show absolute minutes as a secondary figure.

Org total = the same ratio computed across all classes' sums (**not** an average of class percentages — that would weight a 10-student class the same as a 12-student one).

**Chart form:** a stacked horizontal bar per class (in-class vs out-of-class), sorted by out-of-class percentage, with the org-wide figure as the headline. Load the `dataviz` skill before writing any chart code.

### 2.7 Roles and permissions

| Capability | Teacher | Admin |
|---|---|---|
| Run own class (attendance, breaks, session) | Yes | Read-only |
| Own class roster | Yes | Yes |
| Any class roster (edit, transfer students) | No | Yes |
| Own class reports | Yes | Yes |
| All class reports, org dashboard | No | Yes |
| Org defaults (times, limits, flag threshold) | No | Yes |
| Members and invites | No | Yes |
| Start a new academic year | No | Yes |

**Admin is read-only on a live class screen** — deliberately. If the admin can log breaks in someone else's class you get two people driving one record. Full edit rights on rosters and settings, no operating.

Roles are a **list**: at most masjids the admin also teaches. Cheap now, painful to retrofit.

**These boundaries are enforced in Firestore rules, not in the UI.** A UI-only boundary is not a boundary.

### 2.8 Identity, onboarding, invites

**Google Sign-In is primary** — teachers use personal devices with personal accounts, so one tap, verified, no passwords, no email deliverability problems. **Email-link sign-in is the fallback.** Anonymous auth is removed.

Native setup cost to plan for: Google Sign-In in the Capacitor WebView needs the app's signing SHA-1 registered in the Firebase console. One-time, but it touches the local-only keystore.

**First launch asks one question: "Do you have an invite code?"** — not "what kind of account is this?", which users cannot answer before they understand the product.

Three flows:

1. **Joining an organization.** Admin adds `bilal@example.com` → an invite is created. Teacher signs in with Google → the app matches their verified email to the pending invite → member created with the invited roles, invite marked `claimed`. **No code typing in the happy path.** The one-time `code` is the fallback when they sign in with a different address than the admin entered.
2. **Creating an organization.** Sign in → name the org → become `['admin','teacher']` → set defaults → invite teachers.
3. **Personal.** Sign in → an org of one is created with `kind: 'personal'` → straight into the existing class setup. UI never says "organization".

**Returning launch:** durable session, straight into the class. Never show setup when a session exists.

### 2.9 Durable session — "stay logged in"

A storage adapter with two backends:

```
Store.get/set/remove
  native (window.Capacitor?.isNativePlatform?.()) -> @capacitor/preferences   (Android SharedPreferences)
  web                                             -> localStorage
```

Install `@capacitor/preferences` at the major version matching Capacitor core (8.x). SharedPreferences survives WebView data clears and is immune to the origin change in problem #4 — this is what makes it behave like staying signed into the Claude app.

Keys: `session.orgId`, `session.classId`, `session.deviceId`, and `cache.lastClass` (a small last-known-good snapshot purely for instant first paint).

Pin the origin so this cannot regress:
```json
{ "appId": "com.hifztracker.app", "appName": "Hifz Class Tracker", "webDir": "www",
  "server": { "androidScheme": "https" } }
```
Treat this value as frozen — changing it later orphans all stored data.

**Boot sequence:** read session → paint from `cache.lastClass` → await auth → attach listeners → render as data arrives. Tolerate a stored `orgId`/`classId` that no longer exists (fall back to the chooser; never crash). Firebase Auth persistence must be `LOCAL`.

### 2.10 Admin dashboard

Today-focused and live. Everything below updates from the day-doc listeners without a refresh.

1. **Class status strip** — every class: not started / in session / on break / ended, with last activity time.
   *This is the most important element on the screen.* The app assumes everyone is present until marked otherwise, so a class whose teacher never opened the app shows zero absences and reads identically to perfect attendance. Without this strip the admin gets a false all-clear.
2. **Attendance feed** — school-wide absences and tardies as they happen, in one always-visible panel: student, class, teacher, time. Absent and tardy visually distinct (different conversations).
3. **Flag alerts** — when a student reaches `flagThreshold` (default 2) flags in a day, from any reason, an alert appears in the panel. Computed live from `summary.flagsByStudent`; **in-app only, no push notifications.** Raise once per student per day when the threshold is crossed — do not re-raise at 3, 4, 5, or the admin learns to ignore it. Tapping opens that student's day detail. Dismissals persist in `orgs/{orgId}/dayBoard/{date}.acks`.
4. **Productivity chart** — per §2.6.

A flag is *any* limit breach: over the time limit, or over the daily trip count. Count them together for the threshold; distinguish them in the detail view, since one long absence and eight short trips are different behaviours.

### 2.11 Academic year rollover

Admin-triggered — never automatic on a date. Academic calendars shift, and a date-triggered wipe firing at the wrong moment is a bad surprise. The app may *prompt* once the configured start date passes; a human confirms.

**Rollover archives records; it does not touch rosters.** Steps:
1. Offer an export of the outgoing year first (see §5).
2. Set a new `activeYearId` on the org. Prior day docs keep their old `yearId` and remain queryable under "past years". **Nothing is deleted.** The data is tiny and deletion is the one decision that cannot be undone.
3. Each teacher reviews their roster: returning students carry over automatically, graduates are marked inactive with `enrolledUntil`, and **new intake is added** — rollover is not only pruning.

Applies to personal accounts too; a solo teacher has an academic year just the same.

---

## 3. Build and release pipeline

**Phase 0, before anything else** — this is what allowed four correct web fixes to never reach the tablet.

1. **Canonical source** stays at the repo root: `index.html`, `sw.js`, `manifest.json`, `icons/`.
2. **`scripts/build.mjs`** (plain Node, no bundler): copies canonical files into `capacitor-app/www/`, stamps `APP_VERSION` + build timestamp into both copies, fails loudly on a missing file.
3. **npm scripts:** `npm run build`, and `npm run verify` (re-run build; fail if the working tree changes).
4. **CI drift gate** — GitHub Action running `npm run verify` on every PR. Drift becomes structurally impossible.
5. **Version visible in the UI** (teacher menu footer). "Which build is this tablet on?" must be answerable by looking at the screen.
6. **Vendor the Firebase SDK** into `vendor/firebase/` and reference it relatively, so the native app needs no CDN at startup.
7. **Release checklist in `README.md`** — web (push to `main`, trigger the Pages build, confirm `"status":"built"`) and native (`npm run build`, bump `versionCode`/`versionName`, `npx cap sync android`, assemble + sign with the **existing** keystore, `firebase appdistribution:distribute`).

**Hard constraint:** the signing keystore is local-only and gitignored by design. A cloud agent cannot produce an installable native upgrade. Anything intended for the tablet requires a local rebuild and an App Distribution push by the owner. Never generate a new keystore.

---

## 4. Migration

On first boot of the new version, if no `session.orgId` exists:

1. Look for legacy keys (`hifz.guest.classcode`, `hifz.guest.profile`, `hifz.guest.day`, `hifz.tracker.history`) in **both** backends.
2. After sign-in, create a `kind: 'personal'` org owned by that user.
3. Upload: profile → org defaults + class; roster array → `students/*` preserving order, `enrolledFrom` set to the start of the current year; `hifz.tracker.history` → `days/*` (+ `breaks/*`), each stamped with `yearId`; today's state → today's day doc.
4. If a legacy cloud class code exists, offer to import that document too.
5. Write the session keys, set `migratedAt`, and **leave legacy keys in place for one release** as a safety net.
6. Guard on `schemaVersion` so migration is idempotent.

---

## 5. Export and backup

Keep `backupAll()` / `restoreBackup()` working against the new model — the only escape hatch if sync misbehaves. Add:
- **Per-student report** in a parent-friendly layout (not raw CSV).
- **End-of-year export** offered at rollover: the full year as CSV, per class and org-wide.
- Admin can export any class; a teacher only their own.

---

## 6. Firestore rules

Current rules hard-code the three blob fields and must be rewritten. Enforce §2.7 in rules — this is where teacher/admin boundaries become real.

- Helper: read `orgs/{orgId}/members/{request.auth.uid}`; require `status == 'active'`; derive `isAdmin` / `isTeacherOf(classId)`.
- `orgs/{orgId}`: read for any active member; write only `isAdmin`.
- `members`, `invites`: read/write `isAdmin` only. An unauthenticated user must never list invites; claiming an invite is a narrowly-scoped update matched on the caller's verified email.
- `classes/{classId}` and subcollections: read if `isAdmin` or owner; write if owner; roster writes also allowed for `isAdmin`. **Live session/break writes: owner only** — enforcing admin read-only operation.
- Validate shapes, whitelist fields, cap string lengths, keep `list` scoped within an org, retain the catch-all `match /{document=**} { allow read, write: if false; }`.

Test with the emulator (`firebase emulators:start --only firestore`) before deploying (`firebase deploy --only firestore:rules --project hifz-class-tracker-dece7`).

---

## 7. Phased delivery

Each phase ships independently and leaves the app working.

| Phase | Contents | Done when |
|---|---|---|
| **0 — Pipeline** | build script, CI drift gate, version stamp, pin `androidScheme`, vendor Firebase | CI fails on drift; build version visible in-app; native app starts with no network |
| **1 — Durable session** | storage adapter, persisted session, boot straight into class, class chooser replaces forced setup | Force-close and reopen the tablet app repeatedly → straight to the class, including after an app update |
| **2 — Firestore truth** | org-aware schema (personal orgs only at this stage), offline persistence, listeners, write-discipline refactor | Website change appears on tablet within seconds and vice versa; zero writes/minute idle; airplane mode works and flushes on reconnect |
| **3 — History & migration** | day docs power reports, `yearId`, legacy migration, backup/restore | Reports on the website show days recorded on the tablet; an existing device upgrades with zero data loss |
| **4 — Accounts & orgs** | Google Sign-In, members, invites, roles, rules + emulator tests | A teacher invited by email signs in and lands in the right class; rules deny cross-class access |
| **5 — Admin dashboard** | class status strip, attendance feed, flag alerts, productivity chart | Metrics match a hand-computed fixture day; a class that never started is visibly flagged |
| **6 — Year rollover** | admin-triggered rollover, roster carry-over, intake, year export | A rollover preserves rosters and archives records with nothing deleted |

---

## 8. Testing requirements

- **Two-client sync** (Playwright, two contexts, same class): roster edit, break start/stop, attendance change, settings change — assert convergence.
- **Offline:** `context.setOffline(true)`, mutate, reconnect, assert flush and convergence.
- **Cold start:** fresh context with only session keys → class loads, setup screen never appears.
- **Migration:** seed legacy keys including `hifz.tracker.history` → assert Firestore contents and zero data loss.
- **Write count:** instrument the write path; assert zero writes during 60 s idle.
- **Metric correctness:** a fixture day with hand-computed numbers (including a tardy student, an absent student, a mid-year joiner, an `assigned` break and a lunch pause) → assert `outOfClassPct` exactly. This metric is silently wrong if untested.
- **Rules (emulator):** unauthenticated denied; teacher cannot read another class; teacher cannot write org defaults; admin cannot write another teacher's live session; invites not listable.
- **Native smoke test** after a real rebuild: force-close/reopen 3× and confirm it lands straight in the class.

Chromium for Playwright: `/opt/pw-browsers/chromium-*/chrome-linux/chrome`.

---

## 9. Do not

- No framework, bundler, or TypeScript. The app stays a hand-written HTML file plus a trivial Node copy/stamp script. The owner is non-technical; build complexity is a real cost.
- No redesign. Visual changes are limited to what this plan introduces: class chooser, sign-in, admin dashboard, sync/offline indicator, version stamp, and the quick wins in §10.
- Do not break offline use. Bad classroom wifi is the normal case.
- Do not keep localStorage as a parallel source of truth once Firestore lands.
- Do not add Cloud Functions, Cloud Messaging, or anything requiring the Blaze plan. Admin alerts are in-app.
- Do not delete data at year rollover.
- Do not generate a new Android signing key; never commit the keystore.
- Do not delete legacy localStorage keys in the same release that migrates them.
- Never reintroduce `save()` inside `render()`.

**Out of scope entirely:** memorization/academic progress tracking (a separate tool handles it), push notifications, multi-year retention, billing, parent logins.

---

## 10. Quick wins — independent of the phases above

Cheap, visible, and safe to do at any point:

- **Replace the default Capacitor splash** (`capacitor-app/android/app/src/main/res/drawable/splash.png`) — it is currently Capacitor's stock blue logo, not the app's.
- **Remove the blank-shell flash.** The static HTML paints "Hifz Class / In class 0" before the script runs, which reads as real data and has already caused a misdiagnosis. Render nothing until state is ready.
- **Sync/offline indicator** in the header — "offline, changes will sync" beats silent failure.
- **Keep the screen awake during class** (Capacitor KeepAwake) — the tablet is often propped up as a live dashboard.
- **Roster search/filter** — fine at 11 students, painful as classes grow.
- **Android back-button handling** so it can't unexpectedly exit mid-class.
- **Confirm on attendance-changing taps.** The same tap means different things by session state (mark absent before class, log a break during, mark tardy on an absent student), so a mis-tap silently alters a record.

---

## 11. Known gotchas

- **Free tier:** ~50k reads / 20k writes per day. Comfortable *if* write discipline holds; trivially blown by a write-per-render.
- **Client-maintained summaries can drift** if a write fails. Recompute from breaks at class end; always drill down to real break docs.
- **`serverTimestamp()` reads back null locally** until the server round-trips. Guard every date conversion.
- **Day rollover at midnight:** the day id comes from the local device date. The today-listener must re-subscribe when the date changes.
- **Echo suppression:** use `metadata.hasPendingWrites` to avoid re-applying your own writes.
- **Capacitor upgrades:** re-verify `androidScheme` after any major bump — a silent change orphans stored data.
- **`android:allowBackup="true"`:** Android auto-backup can restore a stale session pointing at a deleted org. Boot must tolerate that.
- **Measurement changes behaviour.** Once teachers know out-of-class time is watched, there is a quiet incentive to log fewer breaks. Frame it as visibility, not a scorecard — otherwise the data slowly degrades.
- **The native app does not auto-update.** Assume any tablet bug report concerns an older build until the version stamp proves otherwise.
