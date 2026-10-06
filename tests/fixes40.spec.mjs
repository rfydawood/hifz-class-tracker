// 4.0 Part A - fixes to 3.8. See index.html donutHTML() (A1), cardsHTML() (A2,
// A6), archiveStudent() (A3), setTabsHidden()/fitGrid(reserve) (A4) and
// nextUp() (A5).
import { test, expect } from '@playwright/test';
import {
  setupNewClass, skipTourIfPresent, orgId, openTab, reportsReady, seedFirestoreDay, tileFor,
  startClass, logBreak,
} from './helpers.mjs';

const P = (s) => ({ status: s, at: null, note: '' });
const B = (sid, reason, sec, flag = false) => ({ sid, reason, startAt: null, endAt: null, dur: sec * 1000, over: 0, flag, overTrip: false, assignedMin: null });

async function newClass(page, names = ['Amina', 'Bilal']) {
  await page.goto('/?emulator=1');
  await setupNewClass(page, 'Ustadh Fixes', names);
  await skipTourIfPresent(page);
  return orgId(page);
}
const lastWeek = (page, n) => page.evaluate((n) => dayId(addDays(rangeOf('lastweek').start, n)), n);
const weekBefore = (page, n) => page.evaluate((n) => dayId(addDays(rangeOf('lastweek').start, n - 7)), n);

test('A1: "Where the time went" counts time out only - the middle number matches the Time out card; Assigned is listed with no share', async ({ page }) => {
  test.setTimeout(60000);
  await newClass(page);
  await seedFirestoreDay(page, await lastWeek(page, 0), { s0: P('present'), s1: P('present') },
    [B('s0', 'washroom', 600), B('s1', 'water', 240), B('s0', 'assigned', 300)]);
  await openTab(page, 'reports');
  await page.locator('.rdate[data-range="lastweek"]').click();
  await reportsReady(page);
  await expect(page.locator('[data-card="out"] b')).toHaveText('14 min');
  await expect(page.locator('.donut .dn')).toHaveText('14');                       // not 19: assigned isn't time out
  await expect(page.locator('.dleg [data-type="washroom"]')).toContainText('10 min · 71% · 1 trip');
  await expect(page.locator('.dleg [data-type="water"]')).toContainText('4 min · 29% · 1 trip');
  await expect(page.locator('.dleg [data-type="assigned"]')).toHaveText(/Assigned \(excused\)\s*5 min · 1 trip$/);
  await expect(page.locator('.dleg [data-type="assigned"]')).not.toContainText('%');
});

test('A2: in Daily average, the attendance line keeps whole counts', async ({ page }) => {
  test.setTimeout(60000);
  await newClass(page);
  await seedFirestoreDay(page, await lastWeek(page, 0), { s0: P('tardy'), s1: P('absent') }, [B('s0', 'water', 60)]);
  await seedFirestoreDay(page, await lastWeek(page, 1), { s0: P('present'), s1: P('left') }, [B('s1', 'water', 60)]);
  await openTab(page, 'reports');
  await page.locator('.rdate[data-range="lastweek"]').click();
  await reportsReady(page);
  await page.getByRole('button', { name: 'Daily average' }).click();
  await expect(page.locator('[data-card="att"] b')).toHaveText('75% present');
  await expect(page.locator('[data-card="att"] small')).toHaveText('1 tardy · 1 absent · 1 left early');
  await expect(page.locator('[data-card="att"]')).not.toContainText('a day');
  await expect(page.locator('[data-card="out"] b')).toHaveText('1 min a day');   // the other cards are still per day
});

test('A3: Remove on the Roster asks first, says an open break will end, and Cancel changes nothing', async ({ page }) => {
  test.setTimeout(60000);
  await newClass(page);
  await startClass(page);
  await logBreak(page, 'Bilal', 'Water');
  await openTab(page, 'roster');
  const bilal = page.locator('#viewRoster .rs:not(.gone)', { hasText: 'Bilal' });
  await bilal.getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('.sheet h3')).toHaveText('Remove Bilal from the class list?');
  await expect(page.locator('.sheet')).toContainText('Their past reports stay, and you can put them back at the bottom of Roster.');
  await expect(page.locator('.sheet')).toContainText('water break will end');
  await page.getByRole('button', { name: 'Keep them' }).click();
  await expect(bilal).toBeVisible();
  expect(await page.evaluate(() => Object.keys(state.active).length)).toBe(1);   // still out

  await bilal.getByRole('button', { name: 'Remove' }).click();
  await page.locator('.sheet').getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.locator('#viewRoster .rs.gone', { hasText: 'Bilal' })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(state.active).length)).toBe(0);   // the break was ended and saved
  expect(await page.evaluate(() => state.breaks.length)).toBe(1);
});

test('A4: bringing the tab bar back never leaves a tile under it, not for a single frame', async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 805, height: 504 });
  await newClass(page, ['Amina', 'Bilal', 'Hamza', 'Ibrahim', 'Maryam', 'Yusuf', 'Zayd', 'Khadija', 'Sumayya', 'Ruqayya', 'Musa', 'Isa']);
  await page.getByRole('button', { name: 'Hide the tabs' }).click();
  await page.waitForTimeout(600);
  const worst = await page.evaluate(() => new Promise((done) => {
    const bar = document.getElementById('tabbar'), grid = document.getElementById('grid');
    let frames = 0, worst = -1e9;
    setTabsHidden(false);
    (function frame() {
      const top = bar.getBoundingClientRect().top, gb = grid.getBoundingClientRect().bottom;
      document.querySelectorAll('.tile').forEach((t) => { const b = t.getBoundingClientRect().bottom; worst = Math.max(worst, b - Math.min(top, gb)); });
      if (++frames < 40) requestAnimationFrame(frame); else done(worst);
    })();
  }));
  expect(worst, 'how far the lowest tile reaches past the top of the bar (or the grid)').toBeLessThanOrEqual(0.5);
});

test('A5: the header says "ends 3:30 PM" when the end of class is next, and keeps "next snack"', async ({ page }) => {
  test.setTimeout(60000);
  await page.clock.install({ time: new Date('2026-09-30T09:00:00') });          // a Wednesday, in the past: emulator sign-in tokens stay valid
  await newClass(page);
  await startClass(page);
  await expect(page.locator('#sub')).toContainText('· next snack 10:10 AM');
  await page.clock.setSystemTime(new Date('2026-09-30T11:00:00'));
  await page.evaluate(() => render());
  await expect(page.locator('#sub')).toContainText('· next lunch 12:05 PM');
  await page.clock.setSystemTime(new Date('2026-09-30T15:00:00'));
  await page.evaluate(() => render());
  await expect(page.locator('#sub')).toHaveText(/^Since \d+:\d\d AM · ends 3:30 PM$/);
  await expect(page.locator('#sub')).not.toContainText('next ends');
});

test('A6: a comparison within 5% reads "About the same"; a real change reads Up or Down', async ({ page }) => {
  test.setTimeout(60000);
  await newClass(page);
  // the week before: 10 min a day; last week: 10.3 min a day (3% more)
  await seedFirestoreDay(page, await weekBefore(page, 0), { s0: P('present') }, [B('s0', 'washroom', 600)]);
  await seedFirestoreDay(page, await lastWeek(page, 0), { s0: P('present') }, [B('s0', 'washroom', 618)]);
  await openTab(page, 'reports');
  await page.locator('.rdate[data-range="lastweek"]').click();
  await reportsReady(page);
  await expect(page.locator('[data-card="out"]')).toContainText('About the same as the week before (10 min a day)');
  await expect(page.locator('[data-card="out"]')).not.toContainText('Up from');
  await expect(page.locator('.worth')).toContainText("Nobody's time out went up compared with the week before.");

  await seedFirestoreDay(page, await lastWeek(page, 1), { s0: P('present') }, [B('s0', 'washroom', 1800)]);   // now 24 min a day
  await page.locator('.rdate[data-range="lastweek"]').click();
  await reportsReady(page);
  await expect(page.locator('[data-card="out"]')).toContainText('Up from 10 min a day the week before');
});
