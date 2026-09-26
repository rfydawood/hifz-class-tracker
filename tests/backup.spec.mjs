// The backup is the escape hatch before the security rules change (see
// docs/phase-4.md A2), so it has to be one tap away in the teacher menu and
// hold the class's recorded days. On the native app downloads don't work, so
// it points at the website instead. See index.html backupAll()/drawDrawer().
import { test, expect } from '@playwright/test';
import {
  setupNewClass, skipTourIfPresent, orgId, openDrawer, startClass, logBreak, returnFromBreak,
  mockNativePlatform,
} from './helpers.mjs';
import { readFile } from 'node:fs/promises';

test('Download a backup saves the class and today', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/?emulator=1');
  await setupNewClass(page, 'Ustadh Backup', ['Amina', 'Bilal']);
  await skipTourIfPresent(page);
  await orgId(page);
  await startClass(page);
  await logBreak(page, 'Amina', 'Water');
  await returnFromBreak(page, 'Amina');

  await openDrawer(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.dbtn', { hasText: 'Download a backup' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^hifz-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(data.profile.teacher).toBe('Ustadh Backup');
  expect(data.profile.students.map(s => s.name)).toEqual(['Amina', 'Bilal']);
  const today = await page.evaluate(() => dayId(new Date()));
  expect(data.history[today].breaks).toHaveLength(1);
});

test('the native app points to the website for backups', async ({ browser }) => {
  const ctx = await browser.newContext();
  await mockNativePlatform(ctx);
  const page = await ctx.newPage();
  await page.goto('/?emulator=1');
  await setupNewClass(page, 'Ustadh Native', ['Amina']);
  await skipTourIfPresent(page);
  await openDrawer(page);
  await expect(page.locator('#dbody')).toContainText('Backups download from the website');
  await expect(page.locator('.dbtn', { hasText: 'Download a backup' })).toHaveCount(0);
  await ctx.close();
});
