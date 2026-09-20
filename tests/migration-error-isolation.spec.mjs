// Regression test for a real bug: migrateLegacyHistoryIfNeeded() used to run
// its whole loop inside one try/catch, so a single day throwing aborted
// every day after it, and the failure was silently discarded (the global
// "done" flag was never set, so the next boot walked straight back into the
// same failing day and aborted again - permanently stuck).
//
// This seeds three legacy local days where the middle one is guaranteed to
// throw (a malformed "day id" containing a slash, which makes
// classRef().collection('days').doc(id) throw synchronously - Firestore
// document paths must have an even number of segments). Asserts the day
// BEFORE and the day AFTER the bad one both still make it into Firestore,
// the failure is recorded rather than discarded, and the global flag is
// left unset so a later boot would retry.
import { test, expect } from '@playwright/test';
import {
  setupNewClass, skipTourIfPresent, orgId, seedLegacyLocalHistory,
  waitForMigration, readFirestoreDay,
} from './helpers.mjs';

function localDayId(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

test('a legacy day that fails to migrate does not block the days around it', async ({ browser }) => {
  test.setTimeout(30000);
  const ctx = await browser.newContext();

  const dayBefore = localDayId(new Date(Date.now() - 6 * 86400000));
  const dayAfter = localDayId(new Date(Date.now() - 4 * 86400000));
  const daySnap = (label) => ({
    date: label, startedAt: null, endedAt: null,
    names: { zz: label }, att: { zz: { status: 'present', note: '' } },
    breaks: [{ sid: 'zz', reason: 'water', dur: 60000, over: 0, flag: false, overTrip: false, assignedMin: null }],
  });
  // object key order = insertion order for non-numeric string keys, so the
  // bad entry really does land between the two good ones.
  await seedLegacyLocalHistory(ctx, {
    [dayBefore]: daySnap(dayBefore),
    'bad/id': daySnap('bad/id'),
    [dayAfter]: daySnap(dayAfter),
  });

  const page = await ctx.newPage();
  await page.goto('/?emulator=1');
  await setupNewClass(page, 'Ustadh Isolation', ['Amina']);
  await skipTourIfPresent(page);
  const code = await orgId(page);
  expect(code).toBeTruthy();

  await waitForMigration(page);

  const before = await readFirestoreDay(page, dayBefore);
  const after = await readFirestoreDay(page, dayAfter);
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(before.data.roster.zz).toBe(dayBefore);
  expect(after.data.roster.zz).toBe(dayAfter);

  const failures = await page.evaluate(() => JSON.parse(Store.get('migration.failures') || '{}'));
  expect(Object.keys(failures)).toContain('bad/id');

  // a run with a real failure must not be marked fully done, so it retries
  const flag = await page.evaluate(() => Store.get('migration.legacyHistoryDone.v2'));
  expect(flag).not.toBe('1');

  await ctx.close();
});
