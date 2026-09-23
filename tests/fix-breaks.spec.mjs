// A break can be corrected or deleted after the student is back in. Before,
// only an open break could be edited; a logged one - "forgot to tap Back in,
// so it reads 40 minutes", or a break logged for the wrong student - stayed
// in the record for good. See index.html openStudentBreaks()/editLoggedBreak().
import { test, expect } from '@playwright/test';
import {
  setupNewClass, skipTourIfPresent, joinExistingClass, orgId, tileFor,
  logBreak, returnFromBreak, startClass,
} from './helpers.mjs';

async function twoDevices(browser) {
  const ctxA = await browser.newContext(); const a = await ctxA.newPage();
  await a.goto('/?emulator=1');
  await setupNewClass(a, 'Ustadh Fix', ['Amina', 'Bilal']);
  await skipTourIfPresent(a);
  const code = await orgId(a);
  await startClass(a);
  const ctxB = await browser.newContext(); const b = await ctxB.newPage();
  await b.goto('/?emulator=1');
  await joinExistingClass(b, code);
  await expect.poll(() => b.evaluate(() => state.session.status), { timeout: 15000 }).toBe('live');
  return { a, b, close: async () => { await ctxA.close(); await ctxB.close(); } };
}
// A finished break of a set length, as if it happened earlier today - entered
// the way a teacher would, by correcting both times in the break editor. (It
// used to poke an earlier start time straight into memory; the app rightly
// re-reads the saved record once its writes are confirmed, which undid that.)
const hhmm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
async function loggedBreak(page, name, reason, minsAgo, lengthMin) {
  await logBreak(page, name, reason);
  await tileFor(page, name).click();
  const left = new Date(Date.now() - minsAgo * 60000), back = new Date(left.getTime() + lengthMin * 60000);
  await page.locator('#startTime').fill(hhmm(left));
  await page.locator('#endTime').fill(hhmm(back));
  await page.getByRole('button', { name: `Return ${name}` }).click();
  await expect(tileFor(page, name)).not.toHaveClass(/out/);
}
const openFixList = async (page, name) => {
  await page.evaluate(() => openDaySummary());
  await page.locator('.dsrow', { hasText: name }).click();
  await expect(page.locator('.sheet h3')).toHaveText(`${name}'s breaks today`);
};

test('a logged break can be corrected, and the correction reaches the record', async ({ browser }) => {
  test.setTimeout(90000);
  const { a, b, close } = await twoDevices(browser);
  await loggedBreak(a, 'Amina', 'Washroom', 60, 40);             // "forgot to tap Back in": 40 minutes
  await expect.poll(() => b.evaluate(() => state.breaks.length), { timeout: 15000 }).toBe(1);

  await openFixList(a, 'Amina');
  await a.getByRole('button', { name: 'Fix' }).click();
  const left = await a.locator('#startTime').inputValue();
  const [h, m] = left.split(':').map(Number);
  const back = new Date(); back.setHours(h, m + 6, 0, 0);
  await a.locator('#endTime').fill(`${String(back.getHours()).padStart(2, '0')}:${String(back.getMinutes()).padStart(2, '0')}`);
  await expect(a.locator('#elapsedVal')).toHaveText('6:00');       // answers as you change it - in the whole minutes typed
  await a.getByRole('button', { name: 'Save' }).click();

  const mins = p => p.evaluate(() => Math.round(state.breaks[0].dur / 60000));
  expect(await mins(a)).toBe(6);
  await expect.poll(() => mins(b), { timeout: 15000 }).toBe(6);  // not just this screen
  expect(await b.evaluate(() => state.breaks[0].flag)).toBe(false); // 6 min is inside the 7 min limit - no longer flagged
  await close();
});

test('opening a break and saving without changing it leaves it exactly as it was', async ({ browser }) => {
  test.setTimeout(90000);
  const { a, close } = await twoDevices(browser);
  await logBreak(a, 'Bilal', 'Water');
  await a.waitForTimeout(1300);
  await returnFromBreak(a, 'Bilal');
  const before = await a.evaluate(() => ({ s: +state.breaks[0].startAt, e: +state.breaks[0].endAt }));
  await openFixList(a, 'Bilal');
  await a.getByRole('button', { name: 'Fix' }).click();
  await a.getByRole('button', { name: 'Save' }).click();
  const after = await a.evaluate(() => ({ s: +state.breaks[0].startAt, e: +state.breaks[0].endAt }));
  expect(after).toEqual(before);                                  // seconds and all
  await close();
});

test('a break logged by mistake can be deleted, and the daily limit is recounted', async ({ browser }) => {
  test.setTimeout(90000);
  const { a, b, close } = await twoDevices(browser);
  // three washroom trips against a limit of two: the third is "past daily limit"
  await loggedBreak(a, 'Amina', 'Washroom', 90, 3);
  await loggedBreak(a, 'Amina', 'Washroom', 60, 3);
  await loggedBreak(a, 'Amina', 'Washroom', 30, 3);
  const third = p => p.evaluate(() => state.breaks.slice().sort((x, y) => x.startAt - y.startAt)[2] || {});
  expect((await third(a)).overTrip).toBe(true);
  await expect.poll(() => b.evaluate(() => state.breaks.length), { timeout: 15000 }).toBe(3);

  // the first one was a mis-tap
  await openFixList(a, 'Amina');
  await a.getByRole('button', { name: 'Fix' }).first().click();
  await a.getByRole('button', { name: 'Delete this break' }).click();
  await a.getByRole('button', { name: 'Delete break' }).click();

  expect(await a.evaluate(() => state.breaks.length)).toBe(2);
  await expect.poll(() => b.evaluate(() => state.breaks.length), { timeout: 15000 }).toBe(2);
  // what was the third trip is now the second - inside the limit, so no longer flagged, here or in the record
  const last = p => p.evaluate(() => { const l = state.breaks.slice().sort((x, y) => x.startAt - y.startAt); return l[l.length - 1]; });
  expect((await last(a)).overTrip).toBe(false);
  expect((await last(a)).flag).toBe(false);
  await expect.poll(async () => (await last(b)).flag, { timeout: 15000 }).toBe(false);
  await close();
});
