// IMPLEMENTATION_PLAN.md 2.4: "an idle app with a class open performs zero
// Firestore writes per minute." Section 8 asks for exactly this: instrument
// the write path (see fsWrite()/window.__hifzWriteCount in index.html) and
// assert zero writes during 60s idle.
import { test, expect } from '@playwright/test';
import { setupNewClass, skipTourIfPresent } from './helpers.mjs';

test('idle app with a class open performs zero Firestore writes in 60s', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/?emulator=1');
  await setupNewClass(page, 'Ustadh Idle', ['Amina', 'Bilal']);
  await skipTourIfPresent(page);

  // Let the one-time org bootstrap (org + member + class + student docs +
  // today's day doc) finish before the idle window starts.
  await page.waitForFunction(() => !!window.__hifzOrgId, null, { timeout: 20000 });
  await page.waitForTimeout(500); // let any trailing snapshot echoes settle

  await page.evaluate(() => { window.__hifzWriteCount = 0; });
  await page.waitForTimeout(60000);
  const writes = await page.evaluate(() => window.__hifzWriteCount);
  expect(writes).toBe(0);
});
