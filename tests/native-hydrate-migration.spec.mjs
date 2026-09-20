// Regression test for a real bug found on the tablet: Store.hydrate()'s
// native path checked Capacitor Preferences and, finding nothing, treated
// that as "no data" instead of falling back to the WebView's own
// localStorage - where pre-Phase-1 native builds had written everything,
// since the Preferences plugin didn't exist yet at that point. History that
// was never lost became invisible to the app, so Phase 3's migration had
// nothing to find and reports looked empty.
//
// This simulates exactly that device: Capacitor Preferences plugin present
// but empty, legacy history sitting only in localStorage. Asserts hydrate()
// surfaces it (and promotes it into Preferences), migration uploads it, and
// it shows up in Reports.
import { test, expect } from '@playwright/test';
import {
  mockNativePlatform, readMockPreference, seedLegacyLocalHistory,
  setupNewClass, skipTourIfPresent, orgId, waitForMigration,
  readFirestoreDay, openDayReport,
} from './helpers.mjs';

function localDayId(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

test('native device with empty Preferences but history in localStorage: hydrate falls back, migration uploads it, reports show it', async ({ browser }) => {
  test.setTimeout(30000);
  const ctx = await browser.newContext();
  await mockNativePlatform(ctx);
  const legacyId = localDayId(new Date(Date.now() - 5 * 86400000));
  await seedLegacyLocalHistory(ctx, {
    [legacyId]: {
      date: legacyId, startedAt: null, endedAt: null,
      names: { zzNative: 'Native-Only Student' },
      att: { zzNative: { status: 'present', note: '' } },
      breaks: [{ sid: 'zzNative', reason: 'washroom', dur: 180000, over: 0, flag: true, overTrip: false, assignedMin: null }],
    },
  });

  const page = await ctx.newPage();
  await page.goto('/?emulator=1');
  await setupNewClass(page, 'Ustadh Native', ['Amina']);
  await skipTourIfPresent(page);
  const code = await orgId(page);
  expect(code).toBeTruthy();

  // Preferences started empty; hydrate's localStorage fallback should have
  // promoted the legacy history into it by now - proves the fallback path
  // actually ran, not just that migration happened to find it some other way.
  await expect.poll(() => readMockPreference(page, 'hifz.tracker.history'), { timeout: 10000 }).not.toBeNull();

  await waitForMigration(page);

  const day = await readFirestoreDay(page, legacyId);
  expect(day).not.toBeNull();
  expect(day.data.roster.zzNative).toBe('Native-Only Student');
  expect(day.breaks.length).toBe(1);
  expect(day.breaks[0].reason).toBe('washroom');

  await openDayReport(page, 5);
  await expect(page.locator('.chip', { hasText: 'Days recorded' }).locator('b')).toHaveText('1', { timeout: 10000 });
  await expect(page.locator('.body')).toContainText('Native-Only Student');

  await ctx.close();
});
