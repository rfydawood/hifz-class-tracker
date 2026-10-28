/* Delete my account - shared by the app (index.html: askDeleteAccount() and
   its writer writeDeleteAccount()) and the web page delete-account.html, so
   the two always delete the same things in the same order. Only Firestore
   work lives here; signing in again, removing the Google sign-in itself and
   clearing this device are done by each page.

   What goes, for every org listed in users/{uid} (plus the one the app has
   open, in case users/{uid} was never filled in):
   - a personal org this account is the admin of ("an org of one" - every
     class made in the app so far): every class, each archived first and then
     deleted breaks, days, students, class doc - the same path as "Delete
     forever" (firestore.rules deletesArchivedClass()); then the org doc with
     its invites and member docs (closesPersonalOrg()); this account's own
     member doc last.
   - an org shared with someone else (another member with a different email;
     not possible in the app yet): only this account's member doc - the
     classes belong to the organization and stay. If this account is its only
     admin - or it is a personal org shared with another email, which only
     its admin can close - nothing is deleted at all and the person is asked
     to email.
   then users/{uid}. Each step reads from the server and deletes only what is
   still there, so running it again after a failure carries on where it
   stopped. Every write is handed to `wrap` (the app's fsWrite counter). */
(function (root) {
  const BATCH = 400;                                   // under Firestore's 500 writes a batch
  const SERVER = { source: 'server' };
  const LOCAL_KEYS = ['session.orgId', 'session.classId', 'cache.lastClass', 'hifz.guest.day', 'hifz.guest.profile',
    'hifz.tracker.history', 'migration.legacyHistoryDone.v2', 'migration.failures', 'teacher.pin', 'teacher.unlocked'];
  const LOCAL_PREFIX = 'cache.lastClass.';             // one instant-paint copy per class

  async function commitDeletes(db, refs, wrap) {
    for (let i = 0; i < refs.length; i += BATCH) {
      const b = db.batch(); refs.slice(i, i + BATCH).forEach((r) => b.delete(r));
      await wrap(b.commit());
    }
  }
  /* Everything under an archived class, then the class doc - the rules read
     the class's status to allow the rest, so it goes last. */
  async function deleteClassTree(db, cls, wrap) {
    const refs = [];
    const days = await cls.collection('days').get(SERVER);
    for (const d of days.docs) { (await d.ref.collection('breaks').get(SERVER)).docs.forEach((b) => refs.push(b.ref)); refs.push(d.ref); }
    (await cls.collection('students').get(SERVER)).docs.forEach((x) => refs.push(x.ref));
    await commitDeletes(db, refs, wrap);
    await wrap(cls.delete());
  }

  const isActive = (m) => m && m.status === 'active';
  const isAdminDoc = (m) => isActive(m) && Array.isArray(m.roles) && m.roles.includes('admin');

  /* What deleting would do to one org. action: 'delete' (the whole org),
     'leave' (this account's member doc only), 'blocked' (shared with other
     people in a way only someone else, or an email, can sort out), 'gone' (nothing of it is left to delete). */
  async function planOrg(db, uid, email, orgId) {
    const org = db.collection('orgs').doc(orgId), meRef = org.collection('members').doc(uid);
    const me = await meRef.get(SERVER);
    if (!me.exists) return { orgId, action: 'gone', name: '', classes: [] };
    const m = me.data();
    let o = null;
    try { const s = await org.get(SERVER); o = s.exists ? s.data() : null; }
    // not an active member any more: nothing of it is this account's to delete
    catch (e) { if (!(e && e.code === 'permission-denied')) throw e; return { orgId, action: 'gone', name: '', classes: [] }; }
    const personal = !o || o.kind === 'personal';
    let others = [];
    if (isAdminDoc(m)) {
      const ms = await org.collection('members').get(SERVER);
      others = ms.docs.filter((d) => d.id !== uid).map((d) => d.data()).filter(isActive);
    }
    // Other members of a personal org are this person's own devices from
    // before Google sign-in (no email) or the same Google account.
    const mine = String(email || '').toLowerCase();
    const shared = !personal || others.some((x) => x.email && String(x.email).toLowerCase() !== mine);
    let classes = [];
    if (isActive(m)) {
      try { classes = (await org.collection('classes').get(SERVER)).docs.map((d) => ({ id: d.id, name: d.data().name || '', status: d.data().status || 'active' })); }
      catch (e) { if (!(e && e.code === 'permission-denied')) throw e; }
    }
    const name = (o && o.name) || '';
    if (!shared && isAdminDoc(m)) return { orgId, action: 'delete', name, classes };
    if (isAdminDoc(m) && !others.some(isAdminDoc)) return { orgId, action: 'blocked', name, classes };
    // Leaving is only possible from a shared org (firestore.rules); a personal
    // org this account is not the admin of is not its to delete.
    if (!personal) return { orgId, action: 'leave', name, classes: [] };
    return { orgId, action: 'blocked', name, classes: [] };
  }

  /* Reads only. extraOrgIds: the org the app has open. */
  async function plan(db, uid, email, extraOrgIds) {
    const u = await db.collection('users').doc(uid).get(SERVER);
    const ids = [...new Set([...((u.exists && u.data().orgIds) || []), ...(extraOrgIds || []).filter(Boolean)])];
    const orgs = [];
    for (const id of ids) orgs.push(await planOrg(db, uid, email, id));
    const del = orgs.filter((x) => x.action === 'delete');
    return {
      uid, orgs,
      blocked: orgs.filter((x) => x.action === 'blocked'),
      leaving: orgs.filter((x) => x.action === 'leave'),
      classes: del.flatMap((x) => x.classes.map((c) => Object.assign({ orgId: x.orgId }, c))),
    };
  }

  async function closeOrg(db, uid, orgId, wrap) {
    const org = db.collection('orgs').doc(orgId);
    // 1. every class, archived first so the rules let it be deleted
    const classes = await org.collection('classes').get(SERVER);
    for (const c of classes.docs) {
      if (c.data().status !== 'archived') await wrap(c.ref.set({ status: 'archived' }, { merge: true }));
      await deleteClassTree(db, c.ref, wrap);
    }
    // 2. the org doc, with its invites and the other member docs
    const invites = await org.collection('invites').get(SERVER);
    const members = await org.collection('members').get(SERVER);
    const rest = [...invites.docs.map((d) => d.ref), ...members.docs.filter((d) => d.id !== uid).map((d) => d.ref)];
    const orgThere = (await org.get(SERVER)).exists;
    // the org doc rides in the first batch: the rules let the rest go only
    // with it, or once it has gone
    const ops = orgThere ? [org, ...rest] : rest;
    await commitDeletes(db, ops, wrap);
    // 3. this account's own member doc, last - the steps above need it
    await wrap(org.collection('members').doc(uid).delete());
  }

  /* The deletion itself. Refuses if anything is blocked. */
  async function run(db, p, wrap) {
    wrap = wrap || ((x) => x);
    if (p.blocked.length) throw Object.assign(new Error('blocked'), { code: 'account/blocked' });
    for (const o of p.orgs) {
      if (o.action === 'delete') await closeOrg(db, p.uid, o.orgId, wrap);
      else if (o.action === 'leave') await wrap(db.collection('orgs').doc(o.orgId).collection('members').doc(p.uid).delete());
    }
    await wrap(db.collection('users').doc(p.uid).delete());
  }

  root.HifzAccountDelete = { plan, run, deleteClassTree, LOCAL_KEYS, LOCAL_PREFIX };
})(typeof window !== 'undefined' ? window : globalThis);
