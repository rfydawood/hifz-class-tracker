// IMPLEMENTATION_PLAN.md section 4 (migration) and 8 ("Migration: seed
// legacy keys including hifz.tracker.history -> assert Firestore contents
// and zero data loss"). Phase 3 acceptance: reports on the web app show
// days recorded on the tablet, and an existing device upgrades with zero
// data loss.
//
// This is the scenario the task called out as the risky part: a device
// joins a class that ALREADY has Firestore history (simulating "the tablet
// already recorded this day via Phase 2"), while that same device ALSO has
// its own local legacy history (simulating "this device ran before it ever
// synced") - including one date that CONFLICTS with what's already in
// Firestore. Migration must upload the date Firestore doesn't have, and
// must leave the conflicting date exactly as Firestore already had it.
import { test, expect } from '@playwright/test';
import {
  setupNewClass, skipTourIfPresent, joinExistingClass, orgId, dayIdBack,
  seedFirestoreDay, readFirestoreDay, waitForMigration, seedLegacyLocalHistory,
  openDayReport,
} from './helpers.mjs';

test('a device with local history AND Firestore already having some history merges without losing either side', async ({ browser }) => {
  test.setTimeout(60000);
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();

  await a.goto('/?emulator=1');
  await setupNewClass(a, 'Ustadh Merge', ['Amina', 'Bilal']);
  await skipTourIfPresent(a);
  const code = await orgId(a);
  expect(code).toBeTruthy();

  const conflictId = await dayIdBack(a, 2); // already "recorded" in Firestore below
  const exclusiveId = await dayIdBack(a, 3); // only ever local, on device B

  // Simulate "the tablet already recorded this day via Phase 2": device A
  // writes a real Firestore day doc directly (through the normal write
  // path/rules, not a bypass).
  await seedFirestoreDay(
    a, conflictId,
    { s0: { status: 'present', at: null, note: '' } },
    [{ sid: 's0', reason: 'washroom', startAt: null, endAt: null, dur: 300000, over: 0, flag: false, overTrip: false, assignedMin: null }]
  );

  // A second device that has its OWN local history for both dates -
  // including a conflicting (different) version of the same date A already
  // wrote, and an exclusive date Firestore has never seen.
  const ctxB = await browser.newContext();
  await seedLegacyLocalHistory(ctxB, {
    [conflictId]: {
      date: conflictId, startedAt: null, endedAt: null,
      names: { zzConflict: 'Conflicting Student' },
      att: { zzConflict: { status: 'present', note: '' } },
      breaks: [{ sid: 'zzConflict', reason: 'water', dur: 999000, over: 0, flag: true, overTrip: false, assignedMin: null }],
    },
    [exclusiveId]: {
      date: exclusiveId, startedAt: null, endedAt: null,
      names: { zzExclusive: 'Exclusive Student' },
      att: { zzExclusive: { status: 'present', note: '' } },
      // flagged so it surfaces in the class-scope "Flags by student" view
      // openDayReport() lands on below, without needing to switch to
      // student scope first.
      breaks: [{ sid: 'zzExclusive', reason: 'wudhu', dur: 120000, over: 0, flag: true, overTrip: false, assignedMin: null }],
    },
  });
  const b = await ctxB.newPage();
  await b.goto('/?emulator=1');
  await joinExistingClass(b, code);
  await waitForMigration(b);

  // The conflicting date: Firestore must still match what device A wrote -
  // device B's local copy of that same date must NOT have overwritten it.
  const conflictDay = await readFirestoreDay(b, conflictId);
  expect(conflictDay).not.toBeNull();
  expect(conflictDay.data.attendance.s0.status).toBe('present');
  expect(Object.keys(conflictDay.data.attendance)).not.toContain('zzConflict');
  expect(conflictDay.breaks.length).toBe(1);
  expect(conflictDay.breaks[0].reason).toBe('washroom');
  expect(conflictDay.breaks[0].dur).toBe(300000);

  // The exclusive date: device B's local-only history must now be in
  // Firestore, and visible in Reports (the actual acceptance criterion -
  // "reports on the web app show days that were recorded on the tablet").
  const exclusiveDay = await readFirestoreDay(b, exclusiveId);
  expect(exclusiveDay).not.toBeNull();
  expect(exclusiveDay.data.roster.zzExclusive).toBe('Exclusive Student');
  expect(exclusiveDay.breaks.length).toBe(1);
  expect(exclusiveDay.breaks[0].reason).toBe('wudhu');

  await openDayReport(b, 3);
  await expect(b.locator('.chip', { hasText: 'Days recorded' }).locator('b')).toHaveText('1', { timeout: 10000 });
  await expect(b.locator('.body')).toContainText('Exclusive Student');

  await ctxA.close();
  await ctxB.close();
});
