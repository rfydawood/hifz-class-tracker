// IMPLEMENTATION_PLAN.md section 8: "Two-client sync (Playwright, two
// contexts, same class): roster edit, break start/stop, attendance change,
// settings change - assert convergence." And the Phase 2 acceptance
// criterion: a change on one client appears on another within seconds.
import { test, expect } from '@playwright/test';
import {
  setupNewClass, skipTourIfPresent, joinExistingClass, orgId, tileFor,
  startClass, logBreak, returnFromBreak, addStudentViaDrawer,
  setWashroomLimit, getWashroomLimit,
} from './helpers.mjs';

test('two devices on the same class converge within seconds', async ({ browser }) => {
  test.setTimeout(60000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  await a.goto('/?emulator=1');
  await setupNewClass(a, 'Ustadh Sync', ['Amina', 'Bilal']);
  await skipTourIfPresent(a);
  const code = await orgId(a);
  expect(code).toBeTruthy();

  await b.goto('/?emulator=1');
  await joinExistingClass(b, code);
  await expect(tileFor(b, 'Amina')).toBeVisible({ timeout: 10000 });
  await expect(tileFor(b, 'Bilal')).toBeVisible({ timeout: 10000 });

  // roster edit: A adds a student, B sees it
  await addStudentViaDrawer(a, 'Yusuf');
  await expect(tileFor(b, 'Yusuf')).toBeVisible({ timeout: 10000 });

  // attendance change (pre-class toggle): A marks Bilal not here, B sees it
  await tileFor(a, 'Bilal').click();
  await expect(tileFor(b, 'Bilal')).toHaveClass(/deact/, { timeout: 10000 });

  // session change: A starts class, B's header reflects it
  await startClass(a);
  await expect(b.locator('#mainBtn')).toHaveText('End class', { timeout: 10000 });

  // break start/stop: A checks Amina out, B sees "out"; A returns her, B sees it clear
  await logBreak(a, 'Amina', 'Washroom');
  await expect(tileFor(b, 'Amina')).toHaveClass(/out/, { timeout: 10000 });
  await returnFromBreak(a, 'Amina');
  await expect(tileFor(b, 'Amina')).not.toHaveClass(/out/, { timeout: 10000 });

  // settings change: A changes a break rule, B's drawer reflects it
  await setWashroomLimit(a, 3);
  await expect.poll(() => getWashroomLimit(b), { timeout: 10000 }).toBe('3');

  await ctxA.close();
  await ctxB.close();
});
