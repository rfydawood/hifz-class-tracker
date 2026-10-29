// 4.3: "Back at" can't be in the future. Seen on the tablet: a student out
// for water since 2:09 was returned "Back at 2:30" while it was still 2:09, so
// the break was saved as ~21 minutes and flagged. Both editors - the one for a
// student who is out (saveBreakEdits) and Fix for a logged break
// (saveLoggedBreak) - refuse a time later than now, and say so while the time
// is being picked (recalcElapsed). A time in the past still saves.
import { test, expect } from '@playwright/test';
import { setupNewClass, skipTourIfPresent, tileFor, logBreak, startClass, orgId } from './helpers.mjs';

const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
// A time field only holds hours and minutes of today, so "20 minutes from now"
// late at night would wrap to the morning - not a future time at all.
const nearMidnight = () => { const d = new Date(); return d.getHours() === 23 && d.getMinutes() >= 30; };

async function classWithBackdatedBreak(page) {
  await page.goto('/?emulator=1');
  await setupNewClass(page, 'Ustadh Kareem', ['Bilal R.', 'Hamza T.']);
  await skipTourIfPresent(page);
  await orgId(page);
  await startClass(page);
  await logBreak(page, 'Bilal R.', 'Water');
  await page.evaluate(async () => {
    const id = Object.values(state.active)[0]._id;
    await dayRef().collection('breaks').doc(id).update({ startAt: Date.now() - 30 * 60000 });
  });
  await expect.poll(() => page.evaluate(() => Math.round((Date.now() - Object.values(state.active)[0].startAt) / 60000)), { timeout: 15000 }).toBe(30);
}

test('the out-student editor refuses a Back at later than now; a past one saves', async ({ page }) => {
  test.skip(nearMidnight(), 'time fields cannot express a later time this close to midnight');
  test.setTimeout(60000);
  await classWithBackdatedBreak(page);
  await tileFor(page, 'Bilal R.').click();
  await expect(page.locator('#endTime')).toBeVisible();

  await page.locator('#endTime').fill(hhmm(new Date(Date.now() + 20 * 60000)));
  await expect(page.locator('#elapsedVal')).toHaveText('Back at is later than now');
  await page.getByRole('button', { name: 'Return Bilal R.' }).click();
  await expect(page.locator('#toastMsg')).toHaveText("Back at can't be later than now.");
  await expect(tileFor(page, 'Bilal R.')).toHaveClass(/out/);              // nothing saved
  expect(await page.evaluate(() => state.breaks.length)).toBe(0);

  // A Left at later than now is refused too.
  const back = new Date(Date.now() - 20 * 60000);
  await page.locator('#endTime').fill(hhmm(back));
  await page.locator('#startTime').fill(hhmm(new Date(Date.now() + 20 * 60000)));
  await expect(page.locator('#elapsedVal')).toHaveText('Left at is later than now');
  await page.getByRole('button', { name: 'Return Bilal R.' }).click();
  await expect(page.locator('#toastMsg')).toHaveText("Left at can't be later than now.");
  await expect(tileFor(page, 'Bilal R.')).toHaveClass(/out/);

  // Left 30 minutes ago, back 20 minutes ago: saved as 10 minutes.
  await page.locator('#startTime').fill(hhmm(new Date(Date.now() - 30 * 60000)));
  await page.locator('#endTime').fill(hhmm(back));
  await expect(page.locator('#elapsedVal')).toHaveText('10:00');
  await page.getByRole('button', { name: 'Return Bilal R.' }).click();
  await expect(tileFor(page, 'Bilal R.')).not.toHaveClass(/out/);
  expect(await page.evaluate(() => Math.round(state.breaks[0].dur / 60000))).toBe(10);
});

test('Fix for a logged break refuses a Back at later than now; a past one saves', async ({ page }) => {
  test.skip(nearMidnight(), 'time fields cannot express a later time this close to midnight');
  test.setTimeout(60000);
  await classWithBackdatedBreak(page);
  await tileFor(page, 'Bilal R.').click();
  await page.locator('#endTime').fill(hhmm(new Date(Date.now() - 25 * 60000)));
  await page.getByRole('button', { name: 'Return Bilal R.' }).click();
  await expect(tileFor(page, 'Bilal R.')).not.toHaveClass(/out/);
  await expect.poll(() => page.evaluate(() => Math.round(state.breaks[0].dur / 60000))).toBe(5);

  await page.evaluate(() => openStudentBreaks(state.breaks[0].sid));
  await page.locator('#sheet .brow button', { hasText: 'Fix' }).click();
  await expect(page.locator('#sheet h3')).toHaveText("Fix Bilal R.'s water break");

  await page.locator('#endTime').fill(hhmm(new Date(Date.now() + 15 * 60000)));
  await expect(page.locator('#elapsedVal')).toHaveText('Back at is later than now');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#toastMsg')).toHaveText("Back at can't be later than now.");
  await expect(page.locator('#sheet h3')).toHaveText("Fix Bilal R.'s water break");   // still open, nothing saved
  expect(await page.evaluate(() => Math.round(state.breaks[0].dur / 60000))).toBe(5);

  await page.locator('#startTime').fill(hhmm(new Date(Date.now() - 30 * 60000)));
  await page.locator('#endTime').fill(hhmm(new Date(Date.now() - 22 * 60000)));
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#toastMsg')).toContainText('corrected to 8:00');
  expect(await page.evaluate(() => Math.round(state.breaks[0].dur / 60000))).toBe(8);
});
