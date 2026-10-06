// The tabs along the bottom (3.8): Log, Reports, Roster, Settings. The app
// always opens on Log; the bar can be tucked away (remembered on the device)
// and the tiles grow into the space; the Log tab carries a count of who is out
// while you are elsewhere; Roster and Settings do what the teacher menu did.
// See index.html showTab()/setTabsHidden()/updateLogBadge()/paintRoster()/drawSettings().
import { test, expect } from '@playwright/test';
import {
  setupNewClass, skipTourIfPresent, orgId, openTab, tileFor, startClass, logBreak, readAs,
} from './helpers.mjs';

async function newClass(page, names = ['Amina', 'Bilal', 'Hamza']) {
  await page.goto('/?emulator=1');
  await setupNewClass(page, 'Ustadh Tabs', names);
  await skipTourIfPresent(page);
  return orgId(page);
}

test('the tabs switch between Log, Reports, Roster and Settings, and the app opens on Log', async ({ page }) => {
  test.setTimeout(60000);
  await newClass(page);
  await expect(page.locator('.app')).toHaveAttribute('data-tab', 'log');
  await expect(page.locator('.tab.on')).toHaveText('Log');
  await expect(tileFor(page, 'Amina')).toBeVisible();

  await openTab(page, 'reports');
  await expect(page.locator('#viewReports')).toBeVisible();
  await expect(page.locator('#grid')).toBeHidden();
  await expect(page.locator('.top')).toBeHidden();
  await expect(page.locator('.tab.on')).toHaveText('Reports');

  await openTab(page, 'roster');
  await expect(page.locator('#viewRoster .rs', { hasText: 'Bilal' })).toBeVisible();
  await openTab(page, 'settings');
  await expect(page.locator('#viewSettings')).toContainText('Break limits');

  // the ☰ menu on Log keeps the day's actions only
  await openTab(page, 'log');
  await expect(tileFor(page, 'Amina')).toBeVisible();
  await page.locator('.menu-btn[aria-label="Teacher menu"]').click();
  const menu = page.locator('#dbody');
  for (const t of ['Start class', 'Attendance today', 'Day summary', "Today's log"]) await expect(menu).toContainText(t);
  for (const t of ['Break limits', 'Download a backup', 'Reset the day', 'Class list']) await expect(menu).not.toContainText(t);
  await page.locator('.dhead .menu-btn').click();

  await openTab(page, 'settings');
  await page.reload();
  await expect(page.locator('.app')).toHaveAttribute('data-tab', 'log');
  await expect(tileFor(page, 'Amina')).toBeVisible({ timeout: 15000 });
});

test('tucking the tabs away stays that way after a reload, and the tiles refit both ways', async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 805, height: 504 });
  await newClass(page, ['Amina', 'Bilal', 'Hamza', 'Ibrahim', 'Maryam', 'Yusuf', 'Zayd', 'Khadija', 'Sumayya']);
  const tileH = () => page.evaluate(() => document.querySelector('.tile').getBoundingClientRect().height);
  await page.waitForTimeout(300);
  const shown = await tileH();

  await page.getByRole('button', { name: 'Hide the tabs' }).click();
  await expect(page.locator('.app')).toHaveClass(/tabs-hidden/);
  await expect(page.locator('#tabHandle')).toBeVisible();
  await page.waitForTimeout(400);
  const hidden = await tileH();
  expect(hidden).toBeGreaterThan(shown);
  expect(await page.evaluate(() => localStorage.getItem('ui.tabsHidden'))).toBe('1');

  await page.reload();
  await expect(tileFor(page, 'Amina')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.app')).toHaveClass(/tabs-hidden/);
  await expect(page.locator('#tabHandle')).toBeVisible();

  await page.getByRole('button', { name: 'Show the tabs' }).click();
  await expect(page.locator('.app')).not.toHaveClass(/tabs-hidden/);
  await expect(page.locator('.tabbar .tab').first()).toBeVisible();
  await page.waitForTimeout(400);
  expect(Math.abs((await tileH()) - shown)).toBeLessThan(2);           // back to the size they were
  expect(await page.evaluate(() => localStorage.getItem('ui.tabsHidden'))).toBe('0');
});

test('the Log tab shows how many are out while you are on another tab, red once someone is over', async ({ page }) => {
  test.setTimeout(60000);
  await newClass(page);
  await startClass(page);
  await logBreak(page, 'Amina', 'Water');
  await page.waitForTimeout(1500);                                    // the start is saved and the cloud has answered
  const badge = page.locator('#logBadge');
  await expect(badge).toBeHidden();                                   // not on the Log tab itself

  await openTab(page, 'roster');
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText('1');
  await expect(badge).not.toHaveClass(/over/);

  // past the 2 minute water limit - moved back on this screen only; tick() picks it up
  const writes = await page.evaluate(() => { const sid = state.students[0].id; state.active[sid].startAt = new Date(Date.now() - 5 * 60000); return window.__hifzWriteCount; });
  await expect(badge).toHaveClass(/over/, { timeout: 3000 });
  expect(await page.evaluate(() => window.__hifzWriteCount)).toBe(writes);   // the badge never writes

  await openTab(page, 'log');
  await expect(badge).toBeHidden();
});

test('Roster: add, remove and put back a student, with each saved to the class', async ({ page }) => {
  test.setTimeout(60000);
  const code = await newClass(page);
  await openTab(page, 'roster');
  const rows = page.locator('#viewRoster .rs:not(.gone)');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0).locator('.rn')).toHaveText('1');

  await page.locator('#newName').fill('Zayd');
  await page.locator('#newName').press('Enter');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(3)).toContainText('Zayd');
  await expect(rows.nth(3).locator('.rn')).toHaveText('4');
  const zayd = await page.evaluate(() => state.students.find(s => s.name === 'Zayd').id);
  await expect.poll(() => readAs(page, `orgs/${code}/classes/default/students/${zayd}`).then(d => d && d.active), { timeout: 10000 }).toBe(true);

  await rows.filter({ hasText: 'Bilal' }).getByRole('button', { name: 'Remove' }).click();
  await page.locator('.sheet').getByRole('button', { name: 'Remove', exact: true }).click();   // 4.0: Remove asks first
  await expect(rows).toHaveCount(3);
  await expect(page.locator('#viewRoster .rs.gone', { hasText: 'Bilal' })).toBeVisible();
  const bilal = await page.evaluate(() => state.students.find(s => s.name === 'Bilal').id);
  await expect.poll(() => readAs(page, `orgs/${code}/classes/default/students/${bilal}`).then(d => d && d.active), { timeout: 10000 }).toBe(false);

  await openTab(page, 'log');
  await expect(tileFor(page, 'Zayd')).toBeVisible();
  await expect(tileFor(page, 'Bilal')).toHaveCount(0);

  await openTab(page, 'roster');
  await page.locator('#viewRoster .rs.gone', { hasText: 'Bilal' }).getByRole('button', { name: 'Put back' }).click();
  await expect(rows).toHaveCount(4);
  await expect.poll(() => readAs(page, `orgs/${code}/classes/default/students/${bilal}`).then(d => d && d.active), { timeout: 10000 }).toBe(true);

  // a row opens that student's report
  await rows.filter({ hasText: 'Amina' }).locator('.nm').click();
  await expect(page.locator('.app')).toHaveAttribute('data-tab', 'reports');
  await expect(page.locator('#viewReports select')).toHaveValue(await page.evaluate(() => state.students[0].id));
  await expect(page.locator('.rdate.on')).toHaveText('This week');
});

test('Settings: a change is saved to the class and is still there after a reload', async ({ page }) => {
  test.setTimeout(60000);
  const code = await newClass(page);
  await openTab(page, 'settings');
  await page.getByLabel('Washroom minutes').selectOption('3');
  // 4.0: the snack time is edited in Settings -> Schedule -> Usual day
  await page.locator('.srow.usual').getByRole('button', { name: 'Edit' }).click();
  const snack = page.locator('.sheet .brow2', { has: page.locator('input.bname[value="Snack"]') }).locator('input[type=time]');
  await snack.nth(0).fill('10:30');
  await snack.nth(1).fill('10:40');
  await page.locator('.sheet').getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => readAs(page, `orgs/${code}`).then(d => d.defaults.limits.washroom.min), { timeout: 10000 }).toBe(3);
  await expect.poll(() => readAs(page, `orgs/${code}`).then(d => d.defaults.snack.start), { timeout: 10000 }).toBe('10:30');

  await page.reload();
  await expect(tileFor(page, 'Amina')).toBeVisible({ timeout: 15000 });
  await openTab(page, 'settings');
  await expect(page.getByLabel('Washroom minutes')).toHaveValue('3');
  await expect(page.locator('.srow.usual')).toContainText('Snack 10:30 AM');
});
