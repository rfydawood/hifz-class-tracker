// Firestore security rules tests, run against the local emulator - never
// against production. See IMPLEMENTATION_PLAN.md section 6 and 8.
//
// Start the emulator first:  firebase emulators:start --only firestore
// Then run:                  node --test tests/rules.test.mjs
//
// Phase 4 Part A (docs/phase-4.md A5): membership is the only way in, and
// there are two ways to become a member - create a new org with your own
// member doc in the same batch, or claim an invite sent to your verified
// email (Part B: or by its code). Member docs from before (anonymous
// devices) keep working. Part B tests are at the end of the file.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const PROJECT_ID = 'hifz-rules-test';
let testEnv;

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

test.after(async () => {
  await testEnv.cleanup();
});

test.beforeEach(async () => {
  await testEnv.clearFirestore();
});

const ORG_ID = 'AB3XQ-7KLMN';
const CLASS_ID = 'default';

function orgDoc(overrides = {}) {
  return {
    schemaVersion: 3,
    name: "Ustadh Bilal's Hifz Class",
    kind: 'personal',
    activeYearId: '2025-2026',
    defaults: { startTime: '08:00', endTime: '15:30' },
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}
function memberDoc(overrides = {}) {
  return {
    email: '',
    displayName: 'Ustadh Bilal',
    roles: ['admin', 'teacher'],
    status: 'active',
    joinedAt: null,
    ...overrides,
  };
}
function classDoc(overrides = {}) {
  return { name: 'My Class', teacherUid: 'uidA', settingsOverride: null, status: 'active', ...overrides };
}

async function seedOrgWithMember(uid) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.collection('orgs').doc(ORG_ID).set(orgDoc());
    await db.collection('orgs').doc(ORG_ID).collection('members').doc(uid).set(memberDoc());
    await db.collection('orgs').doc(ORG_ID).collection('classes').doc(CLASS_ID).set(classDoc({ teacherUid: uid }));
  });
}

async function addMember(uid, overrides = {}) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('orgs').doc(ORG_ID).collection('members').doc(uid).set(memberDoc(overrides));
  });
}

test('unauthenticated user cannot read an org', async () => {
  await seedOrgWithMember('uidA');
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(db.collection('orgs').doc(ORG_ID).get());
});

test('unauthenticated user cannot create an org', async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(db.collection('orgs').doc(ORG_ID).set(orgDoc()));
});

test('a signed-in user creates a new org in one batch with their own member doc, class, students and users entry', async () => {
  const db = testEnv.authenticatedContext('uidA', { email: 'bilal@example.com', email_verified: true }).firestore();
  const org = db.collection('orgs').doc(ORG_ID);
  const batch = db.batch();
  batch.set(org, orgDoc());
  batch.set(org.collection('members').doc('uidA'), memberDoc({ email: 'bilal@example.com' }));
  batch.set(org.collection('classes').doc(CLASS_ID), classDoc({ teacherUid: 'uidA' }));
  for (let i = 0; i < 14; i++) {
    batch.set(org.collection('classes').doc(CLASS_ID).collection('students').doc('s' + i),
      { name: 'Student ' + i, active: true, order: i, enrolledFrom: '2026-09-25', enrolledUntil: null });
  }
  batch.set(org.collection('classes').doc(CLASS_ID).collection('days').doc('2026-09-25'),
    { date: '2026-09-25', yearId: '2026-2027', attendance: {}, roster: {}, updatedAt: null });
  batch.set(db.collection('users').doc('uidA'), { orgIds: [ORG_ID], updatedAt: null });
  await assertSucceeds(batch.commit());
  await assertSucceeds(org.get());
});

test('an org cannot be created on its own, without the creator\'s member doc', async () => {
  const db = testEnv.authenticatedContext('uidA').firestore();
  await assertFails(db.collection('orgs').doc(ORG_ID).set(orgDoc()));
});

test('a new org\'s creator must be admin and teacher', async () => {
  const db = testEnv.authenticatedContext('uidA').firestore();
  const org = db.collection('orgs').doc(ORG_ID);
  const batch = db.batch();
  batch.set(org, orgDoc());
  batch.set(org.collection('members').doc('uidA'), memberDoc({ roles: ['teacher'] }));
  await assertFails(batch.commit());
});

test('an org is personal or a school (organization) - nothing else', async () => {
  const db = testEnv.authenticatedContext('uidA').firestore();
  const make = (kind) => {
    const org = db.collection('orgs').doc(ORG_ID);
    const batch = db.batch();
    batch.set(org, orgDoc({ kind }));
    batch.set(org.collection('members').doc('uidA'), memberDoc());
    return batch.commit();
  };
  await assertFails(make('company'));
  await assertSucceeds(make('organization'));
});

test('creating an org doc at an id that already exists is rejected (cannot overwrite someone else\'s org via create)', async () => {
  await seedOrgWithMember('uidA');
  const db = testEnv.authenticatedContext('uidB').firestore();
  const org = db.collection('orgs').doc(ORG_ID);
  const batch = db.batch();
  batch.set(org, orgDoc({ name: 'Hijacked' }));
  batch.set(org.collection('members').doc('uidB'), memberDoc());
  await assertFails(batch.commit());
});

test('a stranger who knows the org id can neither read it nor join it (the old sync-code hole)', async () => {
  await seedOrgWithMember('uidA');
  for (const token of [undefined, { email: 'someone@example.com', email_verified: true }]) {
    const db = testEnv.authenticatedContext('uidB', token).firestore();
    const org = db.collection('orgs').doc(ORG_ID);
    await assertFails(org.get());
    await assertFails(org.collection('classes').doc(CLASS_ID).get());
    // the old self-join: write your own member doc for a known id
    await assertFails(org.collection('members').doc('uidB').set(memberDoc({ displayName: 'Second device' })));
    await assertFails(org.collection('classes').doc(CLASS_ID).collection('students').doc('s1')
      .set({ name: 'Amina', active: true, order: 0, enrolledFrom: '2025-09-01', enrolledUntil: null }));
  }
});

test('an existing anonymous member (joined before Part A) still reads and runs the class', async () => {
  await seedOrgWithMember('uidA');
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('orgs').doc(ORG_ID).collection('members').doc('anonDevice').set(memberDoc({ displayName: '' }));
  });
  const db = testEnv.authenticatedContext('anonDevice', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
  const cls = db.collection('orgs').doc(ORG_ID).collection('classes').doc(CLASS_ID);
  await assertSucceeds(db.collection('orgs').doc(ORG_ID).get());
  await assertSucceeds(cls.collection('days').doc('2026-09-25').set({ date: '2026-09-25', yearId: '2026-2027', attendance: {}, roster: {} }));
  await assertSucceeds(cls.collection('days').doc('2026-09-25').collection('breaks').doc('b1')
    .set({ sid: 's1', reason: 'water', startAt: 1, endAt: null, dur: null, over: null, flag: null, overTrip: false, assignedMin: 2 }));
  await assertSucceeds(db.collection('orgs').doc(ORG_ID).set(orgDoc({ defaults: { startTime: '08:30' } }), { merge: true }));
});

test('a member cannot create a member doc for someone else\'s uid', async () => {
  await seedOrgWithMember('uidA');
  const db = testEnv.authenticatedContext('uidA').firestore();
  await assertFails(
    db.collection('orgs').doc(ORG_ID).collection('members').doc('uidB').set(memberDoc())
  );
});

test('members cannot be listed by a non-admin', async () => {
  await seedOrgWithMember('uidA');
  await addMember('uidT', { roles: ['teacher'] });
  const teacher = testEnv.authenticatedContext('uidT').firestore();
  await assertFails(teacher.collection('orgs').doc(ORG_ID).collection('members').get());
  const admin = testEnv.authenticatedContext('uidA').firestore();
  await assertSucceeds(admin.collection('orgs').doc(ORG_ID).collection('members').get());
});

test('a member may change their own email and name, but not their roles or status, and never delete', async () => {
  await seedOrgWithMember('uidA');
  await addMember('uidT', { roles: ['teacher'] });
  const db = testEnv.authenticatedContext('uidT').firestore();
  const me = db.collection('orgs').doc(ORG_ID).collection('members').doc('uidT');
  await assertSucceeds(me.update({ email: 'bilal@example.com', displayName: 'Bilal' }));
  await assertFails(me.update({ roles: ['admin', 'teacher'] }));
  await assertFails(me.update({ status: 'revoked' }));
  await assertFails(me.delete());
});

test('orgs cannot be listed', async () => {
  await seedOrgWithMember('uidA');
  const db = testEnv.authenticatedContext('uidA').firestore();
  await assertFails(db.collection('orgs').get());
});

test('a member can write students, day docs and break docs; shape violations are rejected', async () => {
  await seedOrgWithMember('uidA');
  const db = testEnv.authenticatedContext('uidA').firestore();
  const cls = db.collection('orgs').doc(ORG_ID).collection('classes').doc(CLASS_ID);

  await assertSucceeds(
    cls.collection('students').doc('s1').set({ name: 'Amina', active: true, order: 0, enrolledFrom: '2025-09-01', enrolledUntil: null })
  );
  await assertFails(
    cls.collection('students').doc('s1').set({ name: 'Amina', active: true, order: 0, extraField: 'nope' })
  );

  await assertSucceeds(
    cls.collection('days').doc('2026-09-18').set({
      date: '2026-09-18', yearId: '2025-2026',
      session: { status: 'live', startedAt: null, endedAt: null, lunchAt: null, pauseLabel: null, resumeAt: null },
      attendance: {}, roster: { s1: 'Amina' }, summary: {}, updatedAt: null,
    })
  );

  await assertSucceeds(
    cls.collection('days').doc('2026-09-18').collection('breaks').doc('b1').set({
      sid: 's1', reason: 'washroom', startAt: null, endAt: null, dur: null, over: null, flag: null, overTrip: false, assignedMin: null,
    })
  );
  await assertFails(
    cls.collection('days').doc('2026-09-18').collection('breaks').doc('b2').set({
      sid: 's1', reason: 'washroom', notAField: true,
    })
  );
});

test('a member can delete an open (not-yet-returned) break doc - this is how a cancelled break is discarded', async () => {
  await seedOrgWithMember('uidA');
  const db = testEnv.authenticatedContext('uidA').firestore();
  const breakRef = db.collection('orgs').doc(ORG_ID).collection('classes').doc(CLASS_ID)
    .collection('days').doc('2026-09-18').collection('breaks').doc('b1');
  await assertSucceeds(breakRef.set({ sid: 's1', reason: 'washroom', startAt: 1, endAt: null, dur: null, over: null, flag: null, overTrip: false, assignedMin: null }));
  await assertSucceeds(breakRef.delete());
});

test('a non-member cannot delete a break doc', async () => {
  await seedOrgWithMember('uidA');
  const admin = testEnv.authenticatedContext('uidA').firestore();
  const breakRef = admin.collection('orgs').doc(ORG_ID).collection('classes').doc(CLASS_ID)
    .collection('days').doc('2026-09-18').collection('breaks').doc('b1');
  await breakRef.set({ sid: 's1', reason: 'washroom', startAt: 1, endAt: null, dur: null, over: null, flag: null, overTrip: false, assignedMin: null });
  const outsider = testEnv.authenticatedContext('uidB').firestore();
  await assertFails(
    outsider.collection('orgs').doc(ORG_ID).collection('classes').doc(CLASS_ID)
      .collection('days').doc('2026-09-18').collection('breaks').doc('b1').delete()
  );
});

test('org update rejects an attempt to switch kind away from personal', async () => {
  await seedOrgWithMember('uidA');
  const db = testEnv.authenticatedContext('uidA').firestore();
  await assertFails(
    db.collection('orgs').doc(ORG_ID).set(orgDoc({ kind: 'organization' }))
  );
});

// ---- Phase 3: reports read a bounded date range of day docs, and
// backupAll() reads the whole days collection unbounded. Neither is a new
// rule - both are `list` queries against days/{date}, already covered by
// the existing `allow get, list: if isMember(orgId)`. These tests prove
// that's actually true rather than assuming it from reading the rule.

async function seedDay(uid, id, extra = {}) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('orgs').doc(ORG_ID).collection('classes').doc(CLASS_ID)
      .collection('days').doc(id).set({ date: id, yearId: '2025-2026', attendance: {}, roster: {}, ...extra });
  });
}

test('a member can range-query days by document id (what reportDays() does) and gets only matching dates', async () => {
  await seedOrgWithMember('uidA');
  await seedDay('uidA', '2025-09-10');
  await seedDay('uidA', '2025-09-15');
  await seedDay('uidA', '2025-10-01'); // outside the range below
  const db = testEnv.authenticatedContext('uidA').firestore();
  const fp = firebase.firestore.FieldPath.documentId();
  const qs = await assertSucceeds(
    db.collection('orgs').doc(ORG_ID).collection('classes').doc(CLASS_ID).collection('days')
      .where(fp, '>=', '2025-09-01')
      .where(fp, '<=', '2025-09-30')
      .get()
  );
  assert.deepEqual(qs.docs.map((d) => d.id).sort(), ['2025-09-10', '2025-09-15']);
});

test('a non-member cannot list/range-query days at all', async () => {
  await seedOrgWithMember('uidA');
  await seedDay('uidA', '2025-09-10');
  const db = testEnv.authenticatedContext('uidB').firestore();
  await assertFails(
    db.collection('orgs').doc(ORG_ID).collection('classes').doc(CLASS_ID).collection('days').get()
  );
});

test('a member can list the whole days collection unbounded (what backupAll() does)', async () => {
  await seedOrgWithMember('uidA');
  await seedDay('uidA', '2025-09-10');
  await seedDay('uidA', '2025-10-01');
  const db = testEnv.authenticatedContext('uidA').firestore();
  const qs = await assertSucceeds(
    db.collection('orgs').doc(ORG_ID).collection('classes').doc(CLASS_ID).collection('days').get()
  );
  assert.equal(qs.docs.length, 2);
});

test('migration\'s "read then conditionally create" pattern works inside a transaction for a member, and is denied for a non-member', async () => {
  await seedOrgWithMember('uidA');
  const member = testEnv.authenticatedContext('uidA').firestore();
  const memberRef = member.collection('orgs').doc(ORG_ID).collection('classes').doc(CLASS_ID)
    .collection('days').doc('2025-09-11');
  await assertSucceeds(member.runTransaction(async (tx) => {
    const snap = await tx.get(memberRef);
    if (!snap.exists) {
      tx.set(memberRef, { date: '2025-09-11', yearId: '2025-2026', attendance: {}, roster: {} });
    }
  }));

  const outsider = testEnv.authenticatedContext('uidB').firestore();
  const outsiderRef = outsider.collection('orgs').doc(ORG_ID).collection('classes').doc(CLASS_ID)
    .collection('days').doc('2025-09-12');
  await assertFails(outsider.runTransaction(async (tx) => {
    const snap = await tx.get(outsiderRef);
    if (!snap.exists) {
      tx.set(outsiderRef, { date: '2025-09-12', yearId: '2025-2026', attendance: {}, roster: {} });
    }
  }));
});

// ---- Part A: users/{uid}, invites and the claim ----

test('users/{uid} is readable and writable only by that uid, with a size-capped orgIds list', async () => {
  const me = testEnv.authenticatedContext('uidA').firestore();
  const other = testEnv.authenticatedContext('uidB').firestore();
  await assertSucceeds(me.collection('users').doc('uidA').set({ orgIds: [ORG_ID], updatedAt: null }));
  await assertSucceeds(me.collection('users').doc('uidA').get());
  await assertFails(other.collection('users').doc('uidA').get());
  await assertFails(other.collection('users').doc('uidA').set({ orgIds: ['X'], updatedAt: null }));
  await assertFails(me.collection('users').doc('uidA').set({ orgIds: [ORG_ID], extra: 1 }));
  await assertFails(me.collection('users').doc('uidA').set({ orgIds: Array.from({ length: 51 }, (_, i) => 'o' + i) }));
  await assertFails(me.collection('users').get());
});

const DAY = 86400000;
function inviteDoc(overrides = {}) {
  return {
    email: 'bilal@example.com', roles: ['admin', 'teacher'], status: 'pending',
    createdBy: 'uidA', createdAt: null,
    expiresAt: firebase.firestore.Timestamp.fromMillis(Date.now() + 7 * DAY),
    ...overrides,
  };
}
async function seedInvite(id, overrides = {}) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('orgs').doc(ORG_ID).collection('invites').doc(id).set(inviteDoc(overrides));
  });
}
function claimBatch(db, uid, inviteId, memberOverrides = {}, inviteOverrides = {}) {
  const org = db.collection('orgs').doc(ORG_ID);
  const batch = db.batch();
  batch.set(org.collection('members').doc(uid), memberDoc({ email: 'bilal@example.com', inviteId, ...memberOverrides }));
  batch.update(org.collection('invites').doc(inviteId), { status: 'claimed', claimedBy: uid, claimedAt: null, ...inviteOverrides });
  return batch;
}
const bilal = (verified = true, email = 'bilal@example.com') =>
  testEnv.authenticatedContext('uidG', { email, email_verified: verified }).firestore();

test('an admin can create an invite; a non-admin cannot', async () => {
  await seedOrgWithMember('uidA');
  await addMember('uidT', { roles: ['teacher'] });
  const admin = testEnv.authenticatedContext('uidA').firestore();
  const teacher = testEnv.authenticatedContext('uidT').firestore();
  const inv = (db) => db.collection('orgs').doc(ORG_ID).collection('invites').doc('i1');
  await assertFails(inv(teacher).set(inviteDoc({ createdBy: 'uidT' })));
  await assertFails(inv(admin).set(inviteDoc({ email: 'Bilal@Example.com' })));      // must be stored lowercased
  await assertSucceeds(inv(admin).set(inviteDoc()));
});

test('claiming an invite with a matching verified email makes you a member with exactly its roles', async () => {
  await seedOrgWithMember('uidA');
  await seedInvite('i1');
  const db = bilal();
  await assertSucceeds(claimBatch(db, 'uidG', 'i1').commit());
  await assertSucceeds(db.collection('orgs').doc(ORG_ID).get());
});

test('the claim works for a mixed-case Google email', async () => {
  await seedOrgWithMember('uidA');
  await seedInvite('i1');
  await assertSucceeds(claimBatch(bilal(true, 'Bilal@Example.com'), 'uidG', 'i1').commit());
});

test('the claim is refused for an unverified email, a different email, other roles, an expired or used invite, or without marking it claimed', async () => {
  await seedOrgWithMember('uidA');
  await seedInvite('i1');
  await assertFails(claimBatch(bilal(false), 'uidG', 'i1').commit());
  await assertFails(claimBatch(bilal(true, 'someone@example.com'), 'uidG', 'i1').commit());
  await assertFails(claimBatch(bilal(), 'uidG', 'i1', { roles: ['admin', 'teacher', 'teacher'] }).commit());
  await assertFails(claimBatch(bilal(), 'uidG', 'i1', {}, { claimedBy: 'someoneElse' }).commit());
  const db = bilal();
  await assertFails(db.collection('orgs').doc(ORG_ID).collection('members').doc('uidG')
    .set(memberDoc({ email: 'bilal@example.com', inviteId: 'i1' })));     // member doc alone, invite untouched

  await seedInvite('i2', { expiresAt: firebase.firestore.Timestamp.fromMillis(Date.now() - DAY) });
  await assertFails(claimBatch(bilal(), 'uidG', 'i2').commit());
  await seedInvite('i3', { status: 'claimed', claimedBy: 'uidX' });
  await assertFails(claimBatch(bilal(), 'uidG', 'i3').commit());
  await seedInvite('i4', { status: 'revoked' });
  await assertFails(claimBatch(bilal(), 'uidG', 'i4').commit());
});

test('an anonymous user cannot claim an invite', async () => {
  await seedOrgWithMember('uidA');
  await seedInvite('i1');
  const anon = testEnv.authenticatedContext('uidG', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
  await assertFails(claimBatch(anon, 'uidG', 'i1').commit());
});

test('the invitee finds their own invite by email, and may only flip it to claimed', async () => {
  await seedOrgWithMember('uidA');
  await seedInvite('i1');
  const db = bilal();
  const qs = await assertSucceeds(db.collectionGroup('invites').where('email', '==', 'bilal@example.com').get());
  assert.equal(qs.docs.length, 1);
  const ref = db.collection('orgs').doc(ORG_ID).collection('invites').doc('i1');
  await assertFails(ref.update({ roles: ['teacher'], status: 'claimed', claimedBy: 'uidG' }));     // roles are not theirs to change
  await assertFails(ref.update({ status: 'claimed', claimedBy: 'uidX' }));                       // nor to claim for someone else
  await assertFails(ref.update({ status: 'revoked' }));
});

test('invites cannot be listed by anyone but the org\'s admins', async () => {
  await seedOrgWithMember('uidA');
  await addMember('uidT', { roles: ['teacher'] });
  await seedInvite('i1');
  const admin = testEnv.authenticatedContext('uidA').firestore();
  await assertSucceeds(admin.collection('orgs').doc(ORG_ID).collection('invites').get());
  const teacher = testEnv.authenticatedContext('uidT', { email: 'teacher@example.com', email_verified: true }).firestore();
  await assertFails(teacher.collection('orgs').doc(ORG_ID).collection('invites').get());
  const stranger = testEnv.authenticatedContext('uidS', { email: 'stranger@example.com', email_verified: true }).firestore();
  await assertFails(stranger.collectionGroup('invites').get());
  await assertFails(stranger.collectionGroup('invites').where('email', '==', 'bilal@example.com').get());
  await assertFails(testEnv.unauthenticatedContext().firestore().collectionGroup('invites').get());
});

test('handover: the claim can also make the new account the class\'s teacher, in the same batch', async () => {
  await seedOrgWithMember('uidA');
  await seedInvite('i1');
  const db = bilal();
  const batch = claimBatch(db, 'uidG', 'i1');
  batch.update(db.collection('orgs').doc(ORG_ID).collection('classes').doc(CLASS_ID), { teacherUid: 'uidG' });
  batch.set(db.collection('users').doc('uidG'), { orgIds: [ORG_ID], updatedAt: null });
  await assertSucceeds(batch.commit());
});

test('in a shared (non-personal) org only the class\'s own teacher runs the class; an admin reads but does not operate', async () => {
  await seedOrgWithMember('uidA');
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('orgs').doc(ORG_ID).update({ kind: 'organization' });
  });
  await addMember('uidT', { roles: ['teacher'] });
  await addMember('uidAdm', { roles: ['admin'] });
  await addMember('uidT2', { roles: ['teacher'] });
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('orgs').doc(ORG_ID).collection('classes').doc(CLASS_ID).update({ teacherUid: 'uidT' });
  });
  const day = (uid) => testEnv.authenticatedContext(uid).firestore()
    .collection('orgs').doc(ORG_ID).collection('classes').doc(CLASS_ID).collection('days').doc('2026-09-25');
  const doc = { date: '2026-09-25', yearId: '2026-2027', attendance: {}, roster: {} };
  await assertSucceeds(day('uidT').set(doc));
  await assertFails(day('uidAdm').set(doc));
  await assertFails(day('uidT2').set(doc));
  await assertSucceeds(day('uidAdm').get());
  const roster = testEnv.authenticatedContext('uidAdm').firestore()
    .collection('orgs').doc(ORG_ID).collection('classes').doc(CLASS_ID).collection('students').doc('s9');
  await assertSucceeds(roster.set({ name: 'Yusuf', active: true, order: 9, enrolledFrom: '2026-09-25', enrolledUntil: null }));
  const settings = testEnv.authenticatedContext('uidT').firestore().collection('orgs').doc(ORG_ID);
  await assertFails(settings.set({ defaults: { startTime: '07:00' } }, { merge: true }));   // teacher can't write org defaults
});

// ---- Phase 4 Part B: schools (orgs of kind 'organization') ----
// A teacher reads and runs only their own class; admins read every class,
// manage people and the school's settings, and never run someone else's
// class; a school may be locked to one email domain; invites can be claimed
// by code; and a school is never left without an active admin.

const SCHOOL = 'SCHOOL-00001';
const DOMAIN = 'uthmanacademy.org';
const school = (uid, email) => testEnv.authenticatedContext(uid, email ? { email, email_verified: true } : undefined).firestore().collection('orgs').doc(SCHOOL);

async function seedSchool({ domain = DOMAIN } = {}) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const org = ctx.firestore().collection('orgs').doc(SCHOOL);
    await org.set(orgDoc({ name: 'Uthman Academy Hifz', kind: 'organization', ...(domain ? { domain } : {}) }));
    const m = (uid, roles, extra = {}) => org.collection('members').doc(uid).set(memberDoc({ email: `${uid}@${DOMAIN}`, roles, ...extra }));
    await m('admin1', ['admin']);
    await m('rafay', ['admin', 'teacher']);
    await m('t1', ['teacher']);
    await m('t2', ['teacher']);
    await m('gone', ['teacher'], { status: 'revoked' });
    for (const uid of ['t1', 't2', 'gone']) {
      const cls = org.collection('classes').doc(uid);
      await cls.set(classDoc({ name: `${uid}'s Hifz Class`, teacherUid: uid }));
      await cls.collection('students').doc('s0').set({ name: 'Student', active: true, order: 0, enrolledFrom: '2026-10-05', enrolledUntil: null });
      await cls.collection('days').doc('2026-10-05').set({ date: '2026-10-05', yearId: '2026-2027', attendance: {}, roster: {} });
      await cls.collection('days').doc('2026-10-05').collection('breaks').doc('b1')
        .set({ sid: 's0', reason: 'water', startAt: 1, endAt: 2, dur: 1, over: 0, flag: false, overTrip: false, assignedMin: 2 });
    }
  });
}

test('a school is created in one batch by an admin and teacher; locked to a domain only by someone from it', async () => {
  const create = (email, extra) => {
    const db = testEnv.authenticatedContext('uidR', { email, email_verified: true }).firestore();
    const org = db.collection('orgs').doc(SCHOOL);
    const batch = db.batch();
    batch.set(org, orgDoc({ kind: 'organization', name: 'Uthman Academy Hifz', ...extra }));
    batch.set(org.collection('members').doc('uidR'), memberDoc({ email }));
    batch.set(db.collection('users').doc('uidR'), { orgIds: [SCHOOL], updatedAt: null });
    return batch.commit();
  };
  await assertFails(create('rfy.dawood@gmail.com', { domain: DOMAIN }));
  await assertFails(create(`rafays.dawood@${DOMAIN}`, { domain: 42 }));
  await assertSucceeds(create(`rafays.dawood@${DOMAIN}`, { domain: DOMAIN }));
});

test('a personal class cannot be locked to a domain', async () => {
  const db = testEnv.authenticatedContext('uidR', { email: `r@${DOMAIN}`, email_verified: true }).firestore();
  const org = db.collection('orgs').doc(ORG_ID);
  const batch = db.batch();
  batch.set(org, orgDoc({ domain: DOMAIN }));
  batch.set(org.collection('members').doc('uidR'), memberDoc());
  await assertFails(batch.commit());
});

test('in a school a teacher reads only their own class; admins read every class', async () => {
  await seedSchool();
  const paths = (uid) => {
    const cls = school('x').collection('classes').doc(uid).path;
    return [cls, `${cls}/students/s0`, `${cls}/days/2026-10-05`, `${cls}/days/2026-10-05/breaks/b1`];
  };
  const read = (who, path) => testEnv.authenticatedContext(who).firestore().doc(path).get();
  for (const p of paths('t1')) {
    await assertSucceeds(read('t1', p));
    await assertFails(read('t2', p));                 // another teacher
    await assertSucceeds(read('admin1', p));
    await assertSucceeds(read('rafay', p));           // admin and teacher of another class
  }
  for (const p of paths('gone')) await assertFails(read('gone', p));   // removed from the school
  const t1 = school('t1');
  await assertFails(t1.collection('classes').get());                                         // can't list the school's classes
  const mine = await assertSucceeds(t1.collection('classes').where('teacherUid', '==', 't1').get());
  assert.equal(mine.docs.length, 1);
  await assertFails(t1.collection('classes').doc('t2').collection('days').get());
  const all = await assertSucceeds(school('admin1').collection('classes').get());
  assert.equal(all.docs.length, 3);
  await assertSucceeds(school('t1').get());          // everyone reads the school's settings
  await assertFails(school('gone').get());
});

test('a teacher sets up one class of their own (its id is their uid), with its roster and day', async () => {
  await seedSchool();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('orgs').doc(SCHOOL).collection('members').doc('t3').set(memberDoc({ roles: ['teacher'] }));
    await ctx.firestore().collection('orgs').doc(SCHOOL).collection('members').doc('adminOnly').set(memberDoc({ roles: ['admin'] }));
  });
  const db = testEnv.authenticatedContext('t3').firestore();
  const org = db.collection('orgs').doc(SCHOOL);
  await assertFails(org.collection('classes').doc('other-id').set(classDoc({ teacherUid: 't3' })));
  await assertFails(org.collection('classes').doc('t3').set(classDoc({ teacherUid: 't1' })));
  const batch = db.batch();
  const cls = org.collection('classes').doc('t3');
  batch.set(cls, classDoc({ name: "Ustadh Musa's Hifz Class", teacherUid: 't3' }));
  batch.set(cls.collection('students').doc('s0'), { name: 'Amina', active: true, order: 0, enrolledFrom: '2026-10-05', enrolledUntil: null });
  batch.set(cls.collection('days').doc('2026-10-05'), { date: '2026-10-05', yearId: '2026-2027', attendance: {}, roster: {} });
  await assertSucceeds(batch.commit());
  await assertSucceeds(cls.update({ name: "Musa's Class" }));                 // may rename it
  await assertFails(cls.update({ teacherUid: 't1' }));                        // but not hand it over
  await assertFails(cls.update({ settingsOverride: { startTime: '07:00' } }));
  await assertFails(org.collection('classes').doc('t1').update({ name: 'Mine now' }));   // nor touch another class
  // an admin who doesn't teach has no class of their own to set up
  const adm = testEnv.authenticatedContext('adminOnly').firestore().collection('orgs').doc(SCHOOL);
  await assertFails(adm.collection('classes').doc('adminOnly').collection('days').doc('2026-10-05')
    .set({ date: '2026-10-05', yearId: '2026-2027', attendance: {}, roster: {} }));
  await assertSucceeds(school('admin1').collection('classes').doc('t3').update({ settingsOverride: { startTime: '07:00' } }));
});

test('in a school only a class\'s own teacher runs it; admins edit rosters and school settings, teachers do neither', async () => {
  await seedSchool();
  const day = (who, cls) => school(who).collection('classes').doc(cls).collection('days').doc('2026-10-06');
  const doc = { date: '2026-10-06', yearId: '2026-2027', attendance: {}, roster: {} };
  await assertSucceeds(day('t1', 't1').set(doc));
  await assertFails(day('t2', 't1').set(doc));
  await assertFails(day('admin1', 't1').set(doc));
  await assertFails(day('rafay', 't1').set(doc));
  await assertFails(day('gone', 'gone').set(doc));
  const brk = (who) => school(who).collection('classes').doc('t1').collection('days').doc('2026-10-05').collection('breaks').doc('b1');
  await assertFails(brk('admin1').delete());
  await assertFails(brk('t2').delete());
  const student = { name: 'Yusuf', active: true, order: 1, enrolledFrom: '2026-10-05', enrolledUntil: null };
  await assertSucceeds(school('admin1').collection('classes').doc('t1').collection('students').doc('s1').set(student));
  await assertFails(school('t2').collection('classes').doc('t1').collection('students').doc('s2').set(student));
  await assertSucceeds(school('admin1').set({ defaults: { startTime: '07:45' }, updatedAt: null }, { merge: true }));
  await assertFails(school('t1').set({ defaults: { startTime: '07:00' } }, { merge: true }));
  await assertFails(school('admin1').set({ domain: 7 }, { merge: true }));
  await assertFails(school('admin1').set({ kind: 'personal' }, { merge: true }));
});

const schoolInvite = (overrides = {}) => inviteDoc({ email: `musa@${DOMAIN}`, roles: ['teacher'], createdBy: 'admin1', ...overrides });

test('a school locked to a domain invites only addresses in it', async () => {
  await seedSchool();
  const inv = (id) => school('admin1').collection('invites').doc(id);
  await assertFails(inv('i1').set(schoolInvite({ email: 'musa@gmail.com' })));
  await assertFails(inv('i2').set(schoolInvite({ email: `musa@sub.${DOMAIN}` })));
  await assertFails(inv('i3').set(schoolInvite({ email: 'no-at-sign' })));
  await assertSucceeds(inv('i4').set(schoolInvite()));
  await assertFails(school('t1').collection('invites').doc('i5').set(schoolInvite({ createdBy: 't1' })));
  // a school that isn't locked takes any address
  await testEnv.clearFirestore();
  await seedSchool({ domain: null });
  await assertSucceeds(school('admin1').collection('invites').doc('i6').set(schoolInvite({ email: 'musa@gmail.com' })));
});

test('an invite\'s code is its own id; the code doc is written by an admin with it and read by exact code only', async () => {
  await seedSchool();
  const CODE = 'QWERT-YUPAS';
  const db = testEnv.authenticatedContext('admin1').firestore();
  const make = (code, inviteId, codeDoc = {}) => {
    const b = db.batch();
    b.set(db.collection('orgs').doc(SCHOOL).collection('invites').doc(inviteId), schoolInvite({ code }));
    b.set(db.collection('inviteCodes').doc(code), { orgId: SCHOOL, roles: ['teacher'], ...codeDoc });
    return b.commit();
  };
  await assertFails(make(CODE, 'some-other-id'));
  await assertFails(make(CODE, CODE, { roles: ['admin'] }));            // roles must be the invite's
  await assertSucceeds(make(CODE, CODE));
  // a teacher can't make codes, nor an admin for a school they don't run
  const t1 = testEnv.authenticatedContext('t1').firestore();
  await assertFails(t1.collection('inviteCodes').doc('ZZZZZ-ZZZZZ').set({ orgId: SCHOOL, roles: ['teacher'] }));
  const outsider = testEnv.authenticatedContext('uidZ', { email: 'z@example.com', email_verified: true }).firestore();
  await assertSucceeds(outsider.collection('inviteCodes').doc(CODE).get());
  await assertFails(outsider.collection('inviteCodes').get());
  await assertFails(outsider.collection('inviteCodes').doc(CODE).update({ roles: ['admin'] }));
  await assertFails(outsider.collection('inviteCodes').doc(CODE).delete());
  const anon = testEnv.authenticatedContext('anonZ', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
  await assertFails(anon.collection('inviteCodes').doc(CODE).get());
});

test('claiming by code: any address in the school\'s domain, while it is pending and unexpired', async () => {
  await seedSchool();
  const CODE = 'QWERT-YUPAS';
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const org = ctx.firestore().collection('orgs').doc(SCHOOL);
    await org.collection('invites').doc(CODE).set(schoolInvite({ code: CODE }));
    await org.collection('invites').doc('OLDXX-XXXXX').set(schoolInvite({ code: 'OLDXX-XXXXX', expiresAt: firebase.firestore.Timestamp.fromMillis(Date.now() - DAY) }));
    await org.collection('invites').doc('auto-id-no-code').set(schoolInvite());
  });
  const claim = (email, inviteId, member = {}) => {
    const db = testEnv.authenticatedContext('uidM', { email, email_verified: true }).firestore();
    const org = db.collection('orgs').doc(SCHOOL);
    const b = db.batch();
    b.set(org.collection('members').doc('uidM'), memberDoc({ email, roles: ['teacher'], inviteId, ...member }));
    b.update(org.collection('invites').doc(inviteId), { status: 'claimed', claimedBy: 'uidM', claimedAt: null });
    b.set(db.collection('users').doc('uidM'), { orgIds: [SCHOOL], updatedAt: null });
    return b.commit();
  };
  await assertFails(claim('musa.personal@gmail.com', CODE));               // outside the domain
  await assertFails(claim(`musa2@${DOMAIN}`, 'auto-id-no-code'));          // no code on that invite: email only
  await assertFails(claim(`musa2@${DOMAIN}`, 'OLDXX-XXXXX'));              // expired
  await assertFails(claim(`musa2@${DOMAIN}`, CODE, { roles: ['admin'] }));
  await assertSucceeds(claim(`musa2@${DOMAIN}`, CODE));
  await assertSucceeds(school('uidM', `musa2@${DOMAIN}`).get());
  // used once
  await assertFails(claim(`musa3@${DOMAIN}`, CODE));
});

test('someone with a code can\'t mark the invite used without becoming a member through it', async () => {
  await seedSchool();
  const CODE = 'QWERT-YUPAS';
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('orgs').doc(SCHOOL).collection('invites').doc(CODE).set(schoolInvite({ code: CODE }));
  });
  await assertFails(school('uidM', `musa2@${DOMAIN}`).collection('invites').doc(CODE)
    .update({ status: 'claimed', claimedBy: 'uidM', claimedAt: null }));
});

test('a school is never left without an active admin', async () => {
  await seedSchool();
  const m = (who, uid) => school(who).collection('members').doc(uid);
  // two admins (admin1, rafay): either may demote or remove the other
  await assertSucceeds(m('admin1', 'rafay').update({ roles: ['teacher'] }));
  // now admin1 is the only admin: can't step down or leave...
  await assertFails(m('admin1', 'admin1').update({ roles: ['teacher'] }));
  await assertFails(m('admin1', 'admin1').update({ status: 'revoked' }));
  await assertFails(m('admin1', 'admin1').update({ roles: [], steppedDownFor: 't1' }));       // t1 isn't an admin
  await assertFails(m('admin1', 'admin1').update({ roles: [], steppedDownFor: 'admin1' }));
  await assertFails(m('admin1', 'admin1').update({ roles: [], steppedDownFor: 'nobody' }));
  // ...but may change their own roles while staying admin
  await assertSucceeds(m('admin1', 'admin1').update({ roles: ['admin', 'teacher'] }));
  // a teacher changes no one's roles, their own included
  await assertFails(m('t1', 't1').update({ roles: ['admin', 'teacher'] }));
  await assertFails(m('t1', 't2').update({ status: 'revoked' }));
  // with a second admin, the first may step down by naming them
  await assertSucceeds(m('admin1', 'rafay').update({ roles: ['admin', 'teacher'] }));
  await assertSucceeds(m('rafay', 'rafay').update({ roles: ['teacher'], steppedDownFor: 'admin1' }));
  await assertFails(m('rafay', 'rafay').update({ roles: ['admin', 'teacher'] }));             // and can't take it back
  // stepping down naming an admin who is being removed in the same batch fails
  await assertSucceeds(m('admin1', 'rafay').update({ roles: ['admin', 'teacher'] }));
  const db = testEnv.authenticatedContext('rafay').firestore();
  const b = db.batch();
  b.update(db.collection('orgs').doc(SCHOOL).collection('members').doc('admin1'), { status: 'revoked' });
  b.update(db.collection('orgs').doc(SCHOOL).collection('members').doc('rafay'), { roles: ['teacher'], steppedDownFor: 'admin1' });
  await assertFails(b.commit());
  // an admin may remove a teacher, and put them back
  await assertSucceeds(m('admin1', 't1').update({ status: 'revoked' }));
  await assertSucceeds(m('admin1', 't1').update({ status: 'active' }));
  await assertFails(m('admin1', 't1').update({ status: 'deleted' }));
  await assertFails(m('admin1', 't1').delete());
});

test('a removed teacher keeps nothing: no school, no class, no running it', async () => {
  await seedSchool();
  await assertSucceeds(school('admin1').collection('members').doc('t1').update({ status: 'revoked' }));
  await assertFails(school('t1').get());
  await assertFails(school('t1').collection('classes').doc('t1').get());
  await assertFails(school('t1').collection('classes').doc('t1').collection('days').doc('2026-10-06')
    .set({ date: '2026-10-06', yearId: '2026-2027', attendance: {}, roster: {} }));
  await assertSucceeds(school('admin1').collection('classes').doc('t1').collection('days').doc('2026-10-05').get());   // the class's record stays
});
