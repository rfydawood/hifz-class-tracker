// Firestore security rules tests, run against the local emulator - never
// against production. See IMPLEMENTATION_PLAN.md section 6 and 8.
//
// Start the emulator first:  firebase emulators:start --only firestore
// Then run:                  node --test tests/rules.test.mjs
//
// Phase 4 Part A (docs/phase-4.md A5): membership is the only way in, and
// there are two ways to become a member - create a new org with your own
// member doc in the same batch, or claim an invite sent to your verified
// email. Member docs from before (anonymous devices) keep working.

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

test('Part A creates personal orgs only', async () => {
  const db = testEnv.authenticatedContext('uidA').firestore();
  const org = db.collection('orgs').doc(ORG_ID);
  const batch = db.batch();
  batch.set(org, orgDoc({ kind: 'organization' }));
  batch.set(org.collection('members').doc('uidA'), memberDoc());
  await assertFails(batch.commit());
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
