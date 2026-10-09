# Organizations (admin mode) - owner's notes

Collected with the owner on 2026-10-08, after 4.0 (My classes, schedules)
shipped. **Still on hold** - nothing here is built. When the owner brings
admin mode back, read this together with "Part B" in `docs/phase-4.md`
(its code is parked in ec2016b / aad9808, reverted by 3a9a65c) and
reconcile: the decisions below replace Part B's "each teacher creates their
own class" model.

Mockups (private to the owner): https://claude.ai/artifact/Rc89p5V3xdzemGpqjLCwbN
Redrawn on 2026-10-08 to match these notes (17 screens: sign-in with email
link, programs, admin-made classes with the per-class switch, Share invite,
"Can see" in People, My classes grouped by organization).

## Words

- Say **organization**, not "school", everywhere in the app ("Set up your
  organization", "Set by your organization", the admin's "Organization" tab).
  Most screens show the organization's own name instead ("Uthman Academy").

## First run - no "what kind of account?" question

1. **Sign in with Google** (as today).
2. Then, decided by the app, not asked:
   - invited (email matches an invite) -> "You're invited" -> their classes;
   - already has classes -> straight in;
   - brand new -> "Set up your class" (as today), with two quiet links at
     the bottom: **"Setting up an organization instead?"** (admin skips making
     a class) and **"Have an invite code?"** (invited at another address).
3. An existing user starts an organization from **Profile -> Set up an
   organization**.

## The owner's step-by-step flow

1. **Admin creates the organization.**
   - Sets it up (name; option: only addresses on the organization's email
     domain may join).
   - Sets schedule and limits. **Per class, a switch "Teacher can change
     times and limits"**: off = locked, shown as "Set by your organization";
     on = the teacher edits them as today.
2. **Admin creates the classes** (teachers don't create organization classes).
   - Admin assigns teacher(s) to each class.
   - Teacher or admin can add the roster (type, or paste a list).
3. **Admin adds the teachers' emails.**
   - Teachers get an invitation. The app can't send email on the free plan
     (needs a server), so the admin taps **Share invite**, which opens
     WhatsApp/email with a ready message and link. The link is only a
     convenience: signing in with the invited email is enough.
   - After joining they are added to the classes the admin assigned.
   - **Important: they must sign in with the same email the admin added.**
     The invite says so ("Sign in with bilal@...").
4. **Admin can change the teacher assigned to a class.** Records stay with
   the class, not the teacher.
5. **Many-to-many:** a teacher can have several classes, and a class can have
   several teachers. They move between them in **My classes** (4.0). Two
   teachers in one class can both log, even on two tablets (live sync). One
   class open at a time per device still applies.
6. **Account recovery:** Google handles it for Google sign-in. Add **"Sign in
   with email link"** (magic link, free in Firebase Auth) as a second option,
   for staff whose email isn't a Google account.
7. **How much each teacher sees** - a per-person setting in **People**:
   own classes only (default) / own classes + summary reports of other
   classes / admin (everything).

## Programs inside one organization

One organization per institution, with **programs** inside it, e.g.

    Uthman Academy
      Boys Full-time Hifz  -> Class A, Class B, Class C
      Girls Full-time Hifz -> Class A, Class B
      Evening Maktab       -> Level 1, Level 2
      Sunday School        -> Juniors, Seniors

- Each program has its own default times and limits (Evening Maktab 5-7 PM,
  Sunday School 10-1); its classes inherit them.
- Reports for the whole organization or one program.
- Optional **program admin** who manages only their program.
- Separate organizations only for truly separate owners whose data must not
  be shared.

## One person in several organizations

- One email can belong to any number of organizations; the app never blocks
  an email for already being in another one (`users/{uid}.orgIds` is
  already a list).
- **My classes** groups classes by organization; switching is "Open", no
  logging out. The organizations' data stays fully separate.
- Two different emails (school email for A, Gmail for B) are two accounts:
  **Profile -> Switch account**, one tap, nothing lost. Advise teachers to
  have both organizations invite the same email.

## Practice copy (2026-10-09)

A working, browser-only practice copy of everything above is at
`prototypes/organizations.html`
(https://rfydawood.github.io/hifz-class-tracker/prototypes/organizations.html).
It is separate from the real app: its own storage keys, made-up people
and students, a "You are:" switcher, "Start over". Built from the owner's
old guest prototype. Test it there before building any of this into
index.html.

## Later ideas (2026-10-09, not built, not in the practice copy yet)

### Name: BreakLog
- The owner wants to rename the app **BreakLog** ("Hifz" is too narrow,
  "tracker" sounds like monitoring). No app by that name was found on a
  quick web search; check the Play Store / App Store and a domain
  (breaklog.app / .com, ~$10-20 a year, optional) before going public.
- Changes the visible name only (title, header, manifest, Android label).
  The website address and the Android id `com.hifztracker.app` never change,
  so installs keep updating. "Hifz" can live on as the madrasa template's name.
- Do it in the same release as organizations, after the practice copy is tried.

### Setup question: "What will you use this for?"
- Asked inside "Set up your class" / "Set up an organization" (not at
  sign-in; invited people never see it). Only sets the starting point;
  everything can be changed later.
- **Madrasa / masjid**: today's setup (Washroom, Water, Wudhu, Other,
  Assigned; class times with snack and lunch).
- **School**: bell schedule (periods, passing time, attendance per period,
  a roster per period); breaks Washroom, Water, Nurse, Office, Locker,
  Counsellor, Other; "Assigned" becomes "Errand". Bigger change than a
  break list - builds on 4.0's schedules and My classes.
- **Something else**: Washroom, Water, Other, Assigned, to rename.
- **Workplace** (shift / staff / late in; Restroom, Rest break, Lunch,
  Personal, Other) left out for now: employee break tracking runs into
  labour and privacy law, and payroll requests. Add later if asked for.

### Custom break types
- Today the five types are built in (washroom, water, wudhu, other,
  assigned) and only their limits can change.
- Planned: admins (or a teacher on their own) rename, hide or add types,
  each with its own colour, minutes and trips per day. Other and Assigned
  always stay (no trip cap / excused time). Hide, never delete, so old
  reports still show them. Set per organization or program; a locked class
  shows them as "Set by your organization".

### Themes
- Admins pick from a short list of ready-made themes (current colours plus
  e.g. Lapis and brass, Slate and teal, Sand and sky), add the
  organization's name and logo, and an optional subtle background behind
  the tiles. No free colour picker.
- Fixed in every theme: in class = calm, out = amber, past the limit = red,
  and the break-type colours.
- Dark mode ("Night study") is a per-tablet switch (Light / Dark /
  Automatic) any teacher can use, not an organization setting.

### Landing page
- Today the website opens straight on "Sign in to your class"; nothing
  explains the app to someone new.
- A landing page would say what it is, show the Log, Reports and
  Organization screens, and send each visitor the right way (teacher ->
  Sign in, organization -> Set up an organization, invited -> sign in with
  the invited email), plus a short FAQ (free? where is data kept? offline?
  devices?).
- Must not take over the app's address (installs and the Android app use
  it): show it only to signed-out visitors, or give it its own path.
- Still to decide: who it is for first (madrasas or schools), and whether
  to buy a domain.

## Still to decide (owner / organization)

- Who the admins are (at least two recommended).
- Who creates the organization: the admin, or the owner then hands over.
- Whether only the organization's email domain may join.
- Check that the organization's Google accounts may sign in to outside apps
  (a Workspace admin can block it; it shows as a Google error screen).
