// IMPLEMENTATION_PLAN.md section 8: "Offline: context.setOffline(true),
// mutate, reconnect, assert flush and convergence." Phase 2 acceptance:
// airplane mode works and flushes on reconnect.
import { test, expect } from '@playwright/test';
import {
  setupNewClass, skipTourIfPresent, joinExistingClass, orgId, tileFor,
  addStudentViaDrawer, logBreak, startClass,
} from './helpers.mjs';

test('mutations made offline apply locally and flush to other devices on reconnect', async ({ browser }) => {
  test.setTimeout(60000);
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();

  await a.goto('/?emulator=1');
  await setupNewClass(a, 'Ustadh Offline', ['Amina', 'Bilal']);
  await skipTourIfPresent(a);
  const code = await orgId(a);
  expect(code).toBeTruthy();
  // let the initial bootstrap writes settle before going offline
  await a.waitForTimeout(500);

  await ctxA.setOffline(true);

  // mutate while offline: this must apply immediately from local state -
  // Firestore's offline persistence, not a network round trip, is what
  // makes this instant.
  await addStudentViaDrawer(a, 'Zayd');
  await expect(tileFor(a, 'Zayd')).toBeVisible();
  await startClass(a); // breaks can only be logged once class is in session
  await logBreak(a, 'Amina', 'Washroom');
  await expect(tileFor(a, 'Amina')).toHaveClass(/out/);

  await ctxA.setOffline(false);

  // a second, fresh device joining after reconnect proves the offline
  // writes actually reached Firestore, not just this tab's own UI state.
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await b.goto('/?emulator=1');
  await joinExistingClass(b, code);
  await expect(tileFor(b, 'Zayd')).toBeVisible({ timeout: 15000 });
  await expect(tileFor(b, 'Amina')).toHaveClass(/out/, { timeout: 15000 });

  await ctxA.close();
  await ctxB.close();
});
