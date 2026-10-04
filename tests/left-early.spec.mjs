// "Left for the day" used to write status 'absent', so a student who attended
// all morning and went home at 2pm was recorded as absent for the whole day -
// the reports counted it against them as if they never came. It is its own
// status now. See index.html markLeft()/crunch()/tap().
import { test, expect } from '@playwright/test';
import {
  setupNewClass, skipTourIfPresent, tileFor, logBreak, returnFromBreak,
  startClass, openTab, reportsReady,
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

  // The day does not count as an absence: she was here, then left early.
  await openTab(page, 'reports');
  await page.getByRole('button', { name: 'One student', exact: true }).click();
  await reportsReady(page);
  await expect(page.locator('#rptLine')).toContainText('Amina');
  await expect(page.locator('[data-card="att"]')).toContainText('100% present');
  await expect(page.locator('[data-card="att"]')).toContainText('0 absent');
  await expect(page.locator('[data-card="att"]')).toContainText('1 left early');
});

test('tapping someone who left brings them back without a tardy mark', async ({ page }) => {
  test.setTimeout(60000);
  await classWithOneEarlyLeaver(page);

  await tileFor(page, 'Amina').click();
  await expect(tileFor(page, 'Amina')).toHaveClass(/present/);
  await expect(tileFor(page, 'Amina')).not.toContainText('Tardy');
  expect(await page.evaluate(() => state.attendance[state.students[0].id].status)).toBe('present');
});
