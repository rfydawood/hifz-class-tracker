// "Left for the day" used to write status 'absent', so a student who attended
// all morning and went home at 2pm was recorded as absent for the whole day -
// the reports counted it against them as if they never came. It is its own
// status now. See index.html markLeft()/agg()/tap().
import { test, expect } from '@playwright/test';
import {
  setupNewClass, skipTourIfPresent, tileFor, logBreak, returnFromBreak,
  startClass, openDrawer,
} from './helpers.mjs';

async function classWithOneEarlyLeaver(page) {
  await page.goto('/?emulator=1');
  await setupNewClass(page, 'Ustadh Early', ['Amina', 'Bilal']);
  await skipTourIfPresent(page);
  await startClass(page);
  await logBreak(page, 'Amina', 'Washroom');       // she was here and using the day
  await returnFromBreak(page, 'Amina');
  await tileFor(page, 'Amina').click();
  await page.getByRole('button', { name: 'Amina left for the day' }).click();
}

test('a student who leaves early is not recorded as absent', async ({ page }) => {
  test.setTimeout(60000);
  await classWithOneEarlyLeaver(page);

  // The tile says what happened, and does not offer to mark her tardy.
  const tile = tileFor(page, 'Amina');
  await expect(tile).toHaveClass(/gone/);
  await expect(tile).not.toHaveClass(/deact/);
  await expect(tile).toContainText('Left');
  await expect(tile).not.toContainText('Not here');

  expect(await page.evaluate(() => state.attendance[state.students[0].id].status)).toBe('left');

  // Her break still counts; the day does not count as an absence.
  await openDrawer(page);
  await page.getByRole('button', { name: /^Reports/ }).click();
  await page.getByRole('button', { name: 'Student', exact: true }).click();
  await expect(page.locator('.chip', { hasText: 'Absent days' })).toContainText('0');
  await expect(page.locator('.chip', { hasText: 'Left early' })).toContainText('1');
  await expect(page.locator('.chip', { hasText: 'Breaks' })).toContainText('1');
});

test('tapping someone who left brings them back without a tardy mark', async ({ page }) => {
  test.setTimeout(60000);
  await classWithOneEarlyLeaver(page);

  await tileFor(page, 'Amina').click();
  await expect(tileFor(page, 'Amina')).toHaveClass(/present/);
  await expect(tileFor(page, 'Amina')).not.toContainText('Tardy');
  expect(await page.evaluate(() => state.attendance[state.students[0].id].status)).toBe('present');
});
