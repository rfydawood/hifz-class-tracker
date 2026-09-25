# Phase 4 — accounts and organizations

Instructions for the Claude Code session that builds Phase 4, on the owner's
Windows machine (`C:\dev\hifz-class-tracker`) with the owner present. Written
2026-09-25 against `main` at 3.6 (versionCode 17). Read this whole file before
doing anything. The owner is non-technical: explain every step that needs them
in one or two plain sentences, and ask before anything on the "ask first" list.

Background you must read first: `CLAUDE.md`, and in `IMPLEMENTATION_PLAN.md`
sections 2.2 (schema), 2.7 (roles), 2.8 (identity), 2.9 (durable session),
6 (rules), 8 (tests), 9 (do not), 11 (gotchas).

## Why it is split

Phase 4 is done in two parts, each built, tested, released and verified on the
tablet before the next begins. **Part A is the goal for this session.** Stop
after Part A's release and ask the owner whether to continue to Part B now or
another day.

- **Part A** — Google sign-in, the owner's existing class moved onto their
  Google account without losing anything, and the security rules that close
  the sync-code hole. Release 3.7.
- **Part B** — organizations: create one, invite teachers by email, roles,
  one class per teacher, admin read-only view of every class. Release 3.8.

## Things that must stay true

1. **The owner's class must never become unreachable.** It lives at
   `orgs/{syncCode}` (the code under teacher menu → Sync), and today the
   tablet's anonymous Firebase user is an active member of it, and is the
   class's `teacherUid`. Moving to Google must **link** that anonymous user to
   the Google account (`linkWithCredential` / `linkWithPopup`), which keeps the
   same uid, so the membership and `teacherUid` stay valid with no data moved.
   Never sign an anonymous member out, delete a member doc, or leave the
   Anonymous provider disabled in the console — existing installs depend on it.
2. **Rules are deployed last**, only after the new app is installed on the
   tablet, the owner has signed in there, and the class is confirmed intact.
   Rules act on the server immediately, for every device and every old build.
3. **Free tier only.** Firebase Auth's Google provider is free on Spark. Do not
   click "Upgrade to Identity Platform", do not add Cloud Functions, do not add
   anything that needs the Blaze plan.
4. Keep the architecture already in `index.html`:
   - every Firestore write goes through a named writer and `send()`, which
     holds writes until `ORG_ID && fbUid` and releases them with `sendHeld()`
     before listeners attach
   - listeners ignore answers while `inflight` writes are unconfirmed and
     `resync()` afterwards (see "the screen only moves forward")
   - a break's limit is `capMs(reason, assignedMin)`; `allowMs` is never saved
   - `DAY_STATE_ID` / `cacheLastClass()` day rollover
   - no writes in `render()` or `tick()` (tests/write-count.spec.mjs)
   - `fitHeader()` / `fitGrid()` and the layout tests at the tablet's real
     sizes (805×504 landscape, 533×781 upright)
5. `npm run verify` clean, and the full suite green (`npm run test:e2e`,
   `npm run test:rules`) before every push to `main`, every rules deploy and
   every release.

## Ask the owner first

- any click in the Firebase or Google Cloud console (tell them exactly where)
- merging to `main`, rebuilding Pages, deploying rules, distributing a build
- anything that deletes data, members, invites or files

Work on a branch named `phase-4a` (then `phase-4b`) and merge when the part is
ready to release.

---

## Part A — Google sign-in, keep the class, close the hole (3.7)

### A1. "Start again" continues the same day

Today, ending class and tapping **Start again** replaces the day's start time
(`doStart()` sets `startedAt = now`). The owner lost a real day's start time
this way on Sep 23. If the session is `ended` and has a `startedAt` for today,
resume it instead: status `live`, keep `startedAt`, clear `endedAt`, leave
attendance alone, log "Class resumed", toast "Class resumed at …". Label the
button **Resume class** in that state. A test: end, resume, `startedAt`
unchanged, and it survives a reload and a second device.

### A2. A backup button

`backupAll()` exists but nothing calls it. Add **Download a backup** to the
teacher menu (web). On the native app, where file downloads don't work,
show a line saying to use the website for backups. Ship this commit early and
rebuild Pages, because **before deploying rules the owner downloads a backup
from the website** (sign in there with the same account, or the sync code if
Part A isn't live yet).

### A3. Console and project setup (the owner clicks, you verify)

1. Owner: Firebase console → Authentication → Sign-in method → **Google** →
   Enable → choose the support email → Save. Leave **Anonymous** enabled.
2. Owner: Authentication → Settings → **Authorized domains** → add
   `rfydawood.github.io` (localhost is there already).
3. You: get the release key's fingerprints with JDK 21's `keytool` from
   `android-app/android.keystore`, reading the password from
   `android-app/KEYSTORE_PASSWORD_KEEP_SAFE.txt` into an environment variable
   (`-storepass:env`) — never print it or write it anywhere. Register both:
   `firebase apps:android:sha:create 1:726082000637:android:5627f387c8f7218644d094 <SHA-1>`
   and the same for SHA-256, `--project hifz-class-tracker-dece7`.
4. You: after steps 1–3, download the Android config:
   `firebase apps:sdkconfig ANDROID 1:726082000637:android:5627f387c8f7218644d094 --project hifz-class-tracker-dece7 -o capacitor-app/android/app/google-services.json`.
   It must now contain an `oauth_client` entry of type 3 (web client) — if not,
   step 1 isn't saved yet. It holds only public config; commit it.
   `android/build.gradle` already has the google-services classpath and
   `app/build.gradle` applies the plugin when the file exists.

### A4. Sign in with Google

- **Native:** install `@capacitor-firebase/authentication@^8` in
  `capacitor-app` (it supports Capacitor 8; check its peer dependencies first).
  Configure it in `capacitor.config.json` with `skipNativeAuth: true` and
  `providers: ["google.com"]`, then `npx cap sync android`. Call it through
  `window.Capacitor.Plugins.FirebaseAuthentication.signInWithGoogle()` — the
  app has no bundler, and with `skipNativeAuth` the native side only hands back
  an ID token. Turn it into `firebase.auth.GoogleAuthProvider.credential(idToken)`
  for the web SDK the app already uses.
- **Web:** `GoogleAuthProvider` with `linkWithPopup` / `signInWithPopup`.
- **Existing install (anonymous, has a class):** a clear, non-blocking prompt
  — banner or teacher-menu item — "Sign in with Google to keep your class on
  your account". It **links** the current anonymous user. Then:
  - update their member doc's `email` and `displayName` from the token;
  - write `users/{uid}` = `{ orgIds: [orgId], updatedAt }` so any device
    signing into this account can find the class.
- **If linking fails with `auth/credential-already-in-use`** (the Google
  account already has its own uid — for example they signed in on the website
  first): hand over through an invite. While still signed in as the anonymous
  admin, create `orgs/{orgId}/invites/{id}` for that verified Google email,
  roles `['admin','teacher']`; then sign in with Google and claim it (A5).
  Set the class's `teacherUid` to the new uid in the same claim. Test this.
- **New install:** the first screen is **Sign in with Google**. A signed-in
  user with no `users/{uid}` entry gets a personal org (as today's
  `bootstrapOrg`, but org + member + class + `users/{uid}` in **one batch**,
  under their Google uid). With one org, go straight to its class; with more,
  show a simple chooser.
- **A second device** signs in with the same Google account and finds the
  class through `users/{uid}`. Remove "Enter your sync code" and the sync-code
  join (`joinByCode`) — after the rules change a code no longer grants access.
  Teacher menu → Sync becomes: "Signed in as name@gmail.com", sync status, and
  **Sign out** (behind a confirm saying the class stays safe in the cloud).
- Auth persistence stays `LOCAL`. Offline, an already signed-in device keeps
  working exactly as now; sign-in itself needs a connection — say so if it
  fails.
- **Tests:** the Auth emulator accepts unsigned Google credentials
  (`GoogleAuthProvider.credential('{"sub":"…","email":"…","email_verified":true}')`).
  Add a test-only hook, active only with `?emulator=1`, and cover: linking an
  anonymous user with a class keeps the uid, the member doc, `teacherUid` and
  every day and break; a second device signing in with that account lands in
  the class; `credential-already-in-use` hands over without losing access; a
  new user gets a personal org. Existing tests that relied on anonymous
  sign-up switch to the hook.

### A5. Rules and the claim

Rewrite `firestore.rules` to IMPLEMENTATION_PLAN.md §6, for Part A:

- `users/{uid}`: read and write only by that uid; fields `orgIds` (list,
  size-capped), `updatedAt`.
- `orgs/{orgId}`: `get` only for active members — this closes the hole where
  any signed-in user who knew the id could read the org and add themselves.
  `create` only as a batch that also creates the creator's own member doc as
  `['admin','teacher']` (use `existsAfter` / `getAfter`); `kind == 'personal'`
  in Part A. `update` admin only.
- `members/{uid}`: `get` own or admin; `list` admin. `create` only (a) with a
  brand-new org in the same batch, or (b) by claiming a pending, unexpired
  invite whose `email` equals `request.auth.token.email.lower()` with
  `email_verified == true` — roles copied exactly from the invite, invite
  marked `claimed` with `claimedBy` in the same batch. Own `email` /
  `displayName` may be updated; `roles` / `status` only by an admin. Never
  delete. **Existing anonymous member docs stay valid.**
- `invites`: create/read/update/revoke by admins of that org. The invitee may
  `get`/`list` through a collection-group query only where `resource.data.email`
  equals their own verified email, and may only flip their own invite to
  `claimed`. No one else can list invites. Add the single-field
  collection-group index for `invites.email` to `firestore.indexes.json` and
  reference it from `firebase.json`.
- Classes, students, days, breaks: read by active members. **Running the
  class** (session, attendance, breaks) only by a member with the `teacher`
  role who is the class's `teacherUid` — or any `teacher` member when the org
  is `kind: 'personal'`, which keeps today's "same person, several devices"
  working. Roster writes also by admins. Keep every field whitelist, size cap
  and the catch-all `deny`.
- `tests/rules.test.mjs`: everything in §8, plus — anonymous stranger who
  knows the org id cannot read it or join; old self-join is denied; existing
  anonymous member still reads and runs the class; claim works only with a
  matching verified email; invites can't be listed by anyone but admins.

### A6. Release 3.7 and the careful order

1. Full suite green; merge `phase-4a`; Pages rebuild and confirm the live
   `sw.js` fingerprint matches the repo.
2. Build and distribute **3.7** (versionCode 18) as CLAUDE.md describes —
   JDK 21, the existing keystore, `--groups hifz-testers`, release notes, tag
   and GitHub release.
3. Owner installs 3.7 on the tablet, opens it (class appears as normal), and
   signs in with Google. Confirm with them: same class, same students, today's
   and past reports intact.
4. Owner downloads a backup from the website (A2), signed in with the same
   Google account.
5. Only now: `npm run test:rules`, then
   `firebase deploy --only firestore --project hifz-class-tracker-dece7`
   (rules and indexes). Wait for the index to finish building
   (`firebase firestore:indexes`).
6. Verify with the owner: the tablet still runs the class (open reports, open
   and close a break sheet — **don't log breaks into a real day**; if a test
   break is logged, delete it with Fix → Delete); the website, signed in with
   the same account, shows the same class.

**Rollback** if anything is wrong after step 5: redeploy the previous rules
immediately —

```
git show <commit before Part A>:firestore.rules > firestore.rules
firebase deploy --only firestore:rules --project hifz-class-tracker-dece7
git checkout firestore.rules
```

— then investigate. Rules don't touch data, so a rollback restores access
without losing anything.

Report to the owner in plain words, then **stop and ask** before Part B.

---

## Part B — organizations and teachers (3.8)

Only after Part A has run in real classes. Per IMPLEMENTATION_PLAN.md 2.2,
2.7, 2.8:

- **First launch** asks "Do you have an invite code?" (plan 2.8), not "what
  kind of account".
- **Create an organization:** name it, become `['admin','teacher']`, org
  `kind: 'organization'` (rules now allow it), set defaults.
- **Invite a teacher:** admin enters an email and roles, and the app creates
  the invite with a one-time code and an expiry (7 days). The happy path
  needs no code: the teacher signs in with Google and the verified email
  matches. The **code fallback** is for signing in with a different address:
  top-level `inviteCodes/{code}` → `{orgId, inviteId, expiresAt}`, `get` by
  exact id only, never listable; claiming by code follows the same rules as
  claiming by email, except the email check.
- **One class per teacher:** replace the fixed `CLASS_ID = 'default'` with
  the class from `session.classId`; a teacher joining an org with no class
  goes through the existing class setup, which creates
  `classes/{newId}` with `teacherUid` = them. Moving the owner's personal
  class into a new organization is a separate, explicit, tested step — ask
  the owner how they want it before building it.
- **People** screen for admins: members with roles, revoke, pending invites
  with resend and revoke. Only admins change roles.
- **Admin view of a class:** read-only (plan 2.7 — the admin never logs
  breaks in someone else's class); reports for every class. Org defaults are
  editable only by admins; a class may override them (`settingsOverride`).
- **Rules** extended and tested for all of it (§8: a teacher can't read
  another class, a teacher can't write org defaults, an admin can't write
  another teacher's live session, invites not listable).
- Release **3.8** with the same careful order as A6: build, install, verify,
  then deploy rules, verify again.
