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

## Still to decide (owner / organization)

- Who the admins are (at least two recommended).
- Who creates the organization: the admin, or the owner then hands over.
- Whether only the organization's email domain may join.
- Check that the organization's Google accounts may sign in to outside apps
  (a Workspace admin can block it; it shows as a Google error screen).
