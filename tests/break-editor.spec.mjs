// The break editor showed "Left at" and "Return at" as editable times, but
// saveBreakEdits() read the return time and threw it away - ret() always ended
// the break at Date.now(), so correcting a return time changed nothing and the
// recorded length was wrong. Elapsed was also painted once at open and never
// recalculated, and Android's clock-picker CLEAR could leave a field blank with
// no way back. See index.html editBreak()/saveBreakEdits()/ret().
import { test, expect } from '@playwright/test';
import {
  setupNewClass, skipTourIfPresent, tileFor, logBreak, startClass,
} from './helpers.mjs';

async function openClassWithOneBreak(page) {
  await page.goto('/?emulator=1');
  await setupNewClass(page, 'Ustadh Editor', ['Amina', 'Bilal']);
  await skipTourIfPresent(page);
  await startClass(page);
  await logBreak(page, 'Amina', 'Washroom');
  await expect(tileFor(page, 'Amina')).toHaveClass(/out/);
  // backdate the open break so there is a real span to edit
  await page.evaluate(() => { state.active[Object.keys(state.active)[0]].startAt = new Date(Date.now() - 30 * 60000); });
  await tileFor(page, 'Amina').click();
  await expect(page.locator('#startTime')).toBeVisible();
}

test('a corrected return time is what gets recorded', async ({ page }) => {
  test.setTimeout(60000);
  await openClassWithOneBreak(page);

  // Left 30 min ago; say they actually got back 10 minutes after leaving.
  const left = await page.locator('#startTime').inputValue();
  const [h, m] = left.split(':').map(Number);
  const back = new Date(); back.setHours(h, m + 10, 0, 0);
  const backStr = `${String(back.getHours()).padStart(2, '0')}:${String(back.getMinutes()).padStart(2, '0')}`;
  await page.locator('#endTime').fill(backStr);

  // Elapsed answers while they are still editing, not after they commit.
  await expect(page.locator('#elapsedVal')).toHaveText('10:00');

  await page.getByRole('button', { name: 'Return Amina' }).click();
  await expect(tileFor(page, 'Amina')).not.toHaveClass(/out/);

  const dur = await page.evaluate(() => state.breaks[0].dur);
  expect(Math.round(dur / 60000)).toBe(10);      // not the 30 minutes the wall clock would have given
});

test('a return before the start is refused, and a cleared field comes back', async ({ page }) => {
  test.setTimeout(60000);
  await openClassWithOneBreak(page);

  const left = await page.locator('#startTime').inputValue();
  const [h, m] = left.split(':').map(Number);
  const before = new Date(); before.setHours(h, m - 5, 0, 0);
  await page.locator('#endTime').fill(`${String(before.getHours()).padStart(2, '0')}:${String(before.getMinutes()).padStart(2, '0')}`);
  await expect(page.locator('#elapsedVal')).toContainText('before the start');

  await page.getByRole('button', { name: 'Return Amina' }).click();
  await expect(page.locator('#toast')).toContainText('cannot be before');
  await expect(tileFor(page, 'Amina')).toHaveClass(/out/);      // still out - nothing was recorded

  // CLEAR on Android's clock picker empties the field; it must not stick.
  await page.locator('#endTime').fill('');
  await page.locator('#endTime').dispatchEvent('change');
  expect(await page.locator('#endTime').inputValue()).not.toBe('');
});
