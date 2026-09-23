// A break's time limit has to survive the app re-reading the cloud. The limit
// (allowMs) isn't a saved field, and breaks rebuilt from the cloud read it as
// zero - so from 3.5, when the app started re-reading after every save, a
// break lost its limit seconds after it began: the tile never turned red, and
// a 20-minute washroom trip on a 7-minute limit was recorded 0 over, not
// flagged. Each trip now saves its own minutes (the stepper's number, for every
// break type since 3.6) and the limit is worked out from them.
import { test, expect } from '@playwright/test';
import { setupNewClass, skipTourIfPresent, joinExistingClass, orgId, tileFor, logBreak, startClass } from './helpers.mjs';

async function connectedClass(page) {
  await page.goto('/?emulator=1');
  await setupNewClass(page, 'Ustadh Limits', ['Amina', 'Bilal']);
  await skipTourIfPresent(page);
  const code = await orgId(page);
  await startClass(page);
  return code;
}
const openBreak = p => p.evaluate(() => Object.values(state.active)[0]);
// move the saved start time back, the way time passing would
const backdate = (p, mins) => p.evaluate(async (m) => {
  const id = Object.values(state.active)[0]._id;
  await dayRef().collection('breaks').doc(id).update({ startAt: Date.now() - m * 60000 });
}, mins);

test('washroom starts at the class limit, and a trip over it is flagged even after syncing', async ({ page }) => {
  test.setTimeout(60000);
  await connectedClass(page);
  await tileFor(page, 'Amina').click();
  await page.locator('.reason', { hasText: 'Washroom' }).click();
  await expect(page.locator('#minDisplay')).toHaveText('7');            // the class's washroom limit
  await page.getByRole('button', { name: "Start Amina's break" }).click();
  await page.waitForTimeout(2500);                                        // saved, confirmed, re-read
  expect((await openBreak(page)).allowMs).toBe(7 * 60000);

  await backdate(page, 20);
  await expect(tileFor(page, 'Amina')).toHaveClass(/long/, { timeout: 5000 }); // turns red on screen
  await tileFor(page, 'Amina').click();
  await page.getByRole('button', { name: 'Return Amina' }).click();
  await page.waitForTimeout(2500);
  const b = await page.evaluate(() => state.breaks[0]);
  expect(Math.round(b.over / 60000)).toBe(13);
  expect(b.flag).toBe(true);
});

test('a trip given more time keeps it - on this device and on another', async ({ browser }) => {
  test.setTimeout(90000);
  const ctxA = await browser.newContext(); const a = await ctxA.newPage();
  const code = await connectedClass(a);
  await logBreak(a, 'Bilal', 'Washroom', 10);                            // teacher allows 10 this time
  const ctxB = await browser.newContext(); const b = await ctxB.newPage();
  await b.goto('/?emulator=1');
  await joinExistingClass(b, code);
  await expect(tileFor(b, 'Bilal')).toHaveClass(/out/, { timeout: 15000 });
  expect((await openBreak(a)).allowMs).toBe(10 * 60000);
  expect((await openBreak(b)).allowMs).toBe(10 * 60000);
  await backdate(a, 9);                                                   // 9 of 10 minutes - not over
  await a.waitForTimeout(1500);
  await expect(tileFor(a, 'Bilal')).not.toHaveClass(/long/);
  await ctxA.close(); await ctxB.close();
});

test('water and wudhu start at 2 minutes; the stepper stops at 10', async ({ page }) => {
  test.setTimeout(60000);
  await connectedClass(page);
  for (const reason of ['Water', 'Wudhu']) {
    await tileFor(page, 'Amina').click();
    await page.locator('.reason', { hasText: reason }).click();
    await expect(page.locator('#minDisplay')).toHaveText('2');
    await page.getByRole('button', { name: 'Back' }).click();
    await page.locator('.sheet .x').click();
  }
  await tileFor(page, 'Amina').click();
  await page.locator('.reason', { hasText: 'Washroom' }).click();
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'More minutes' }).click();
  await expect(page.locator('#minDisplay')).toHaveText('10');
});
