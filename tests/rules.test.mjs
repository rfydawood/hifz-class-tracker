// Firestore security rules tests, run against the local emulator - never
// against production. See IMPLEMENTATION_PLAN.md section 6 and 8.
//
// Start the emulator first:  firebase emulators:start --only firestore
// Then run:                  node --test tests/rules.test.mjs
//
// Phase 2 scope: personal orgs only (one member, roles ['admin','teacher']).
// Full admin/teacher separation and invites are Phase 4 and are not tested
// here because they don't exist yet.

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

test('unauthenticated user cannot read an org', async () => {
  await seedOrgWithMember('uidA');
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(db.collection('orgs').doc(ORG_ID).get());
});

test('unauthenticated user cannot create an org', async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(db.collection('orgs').doc(ORG_ID).set(orgDoc()));
});

test('a fresh authenticated user can create a brand-new org and join it as a member', async () => {
  const db = testEnv.authenticatedContext('uidA').firestore();
  await assertSucceeds(db.collection('orgs').doc(ORG_ID).set(orgDoc()));
  await assertSucceeds(
    db.collection('orgs').doc(ORG_ID).collection('members').doc('uidA').set(memberDoc())
  );
  // now a member: can read the org and write the class doc
  await assertSucceeds(db.collection('orgs').doc(ORG_ID).get());
  await assertSucceeds(
    db.collection('orgs').doc(ORG_ID).collection('classes').doc(CLASS_ID).set(classDoc({ teacherUid: 'uidA' }))
  );
});

test('creating an org doc at an id that already exists is rejected (cannot overwrite someone else\'s org via create)', async () => {
  await seedOrgWithMember('uidA');
  const db = testEnv.authenticatedContext('uidB').firestore();
  await assertFails(db.collection('orgs').doc(ORG_ID).set(orgDoc({ name: 'Hijacked' })));
});

test('a user who has not joined can read the bare org doc (to verify a sync code before joining) but not its classroom data', async () => {
  await seedOrgWithMember('uidA');
  const db = testEnv.authenticatedContext('uidB').firestore();
  // this is how joinByCode() confirms a code is real before writing a member doc
  await assertSucceeds(db.collection('orgs').doc(ORG_ID).get());
  await assertFails(
    db.collection('orgs').doc(ORG_ID).collection('classes').doc(CLASS_ID).get()
  );
  await assertFails(
    db.collection('orgs').doc(ORG_ID).collection('classes').doc(CLASS_ID)
      .set(classDoc({ teacherUid: 'uidB' }))
  );
});

test('a second device joining with the same org id (its own uid) gains real access - this is how cross-device sync attaches', async () => {
  await seedOrgWithMember('uidA');
  const db = testEnv.authenticatedContext('uidB').firestore();
  await assertSucceeds(
    db.collection('orgs').doc(ORG_ID).collection('members').doc('uidB').set(memberDoc({ displayName: 'Second device' }))
  );
  await assertSucceeds(db.collection('orgs').doc(ORG_ID).get());
  await assertSucceeds(
    db.collection('orgs').doc(ORG_ID).collection('classes').doc(CLASS_ID).collection('students').doc('s1')
      .set({ name: 'Amina', active: true, order: 0, enrolledFrom: '2025-09-01', enrolledUntil: null })
  );
});

test('a member cannot create a member doc for someone else\'s uid', async () => {
  await seedOrgWithMember('uidA');
  const db = testEnv.authenticatedContext('uidA').firestore();
  await assertFails(
    db.collection('orgs').doc(ORG_ID).collection('members').doc('uidB').set(memberDoc())
  );
});

test('members cannot be listed', async () => {
  await seedOrgWithMember('uidA');
  const db = testEnv.authenticatedContext('uidA').firestore();
  await assertFails(db.collection('orgs').doc(ORG_ID).collection('members').get());
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
