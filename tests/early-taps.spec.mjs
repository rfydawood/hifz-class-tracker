// Taps made while the app is still connecting must still reach the cloud.
// Every writer used to begin `if(!ORG_ID) return;` - no org id yet, so the
// change was silently thrown away, not queued. ORG_ID is only known after
// sign-in plus a server round trip, on EVERY app open (attachToOrg), and for
// several round trips when a class is first created (bootstrapOrg). A break
// logged in that window was kept on screen, then the breaks listener attached,
// read the cloud's list (which never got it) and replaced the screen's list
// with it: the break vanished, from the screen and from the record. On weak
// classroom wifi that window is seconds, not milliseconds.
import { test, expect } from '@playwright/test';
import {
  setupNewClass, skipTourIfPresent, joinExistingClass, orgId, tileFor,
  logBreak, returnFromBreak, startClass,
} from './helpers.mjs';

test('a break logged while the app is still connecting is not lost', async ({ browser }) => {
  test.setTimeout(90000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // an existing class, fully synced
  await page.goto('/?emulator=1');
  await setupNewClass(page, 'Ustadh Slow', ['Amina', 'Bilal']);
  await skipTourIfPresent(page);
  const code = await orgId(page);
  await page.waitForTimeout(800);

  // reopen the app on bad wifi: hold every Firestore request for a while
  let slow = true;
  await page.route(/127\.0\.0\.1:8080/, async (route) => {
    while (slow) await new Promise((r) => setTimeout(r, 100));
    await route.continue().catch(() => {});
  });
  await page.reload();
  await expect(tileFor(page, 'Amina')).toBeVisible();
  expect(await page.evaluate(() => window.__hifzOrgId)).toBeFalsy();   // really still connecting

  // the teacher doesn't wait for it
  await startClass(page);
  await logBreak(page, 'Amina', 'Washroom');
  await returnFromBreak(page, 'Amina');
  expect(await page.evaluate(() => state.breaks.length)).toBe(1);

  // the wifi catches up
  slow = false;
  await expect.poll(() => page.evaluate(() => window.__hifzOrgId), { timeout: 20000 }).toBe(code);
  await page.waitForTimeout(2500);                      // listeners attach and answer

  // still on this screen...
  expect(await page.evaluate(() => state.breaks.length)).toBe(1);
  expect(await page.evaluate(() => state.session.status)).toBe('live');

  // ...and in the record: a second device sees it
  const ctx2 = await browser.newContext();
  const other = await ctx2.newPage();
  await other.goto('/?emulator=1');
  await joinExistingClass(other, code);
  await expect.poll(() => other.evaluate(() => state.breaks.length), { timeout: 15000 }).toBe(1);
  await expect.poll(() => other.evaluate(() => state.session.status), { timeout: 15000 }).toBe('live');

  await ctx.close(); await ctx2.close();
});
