// 4.0 Part C - different times on different days, per class: the usual day,
// a weekday that differs, and one-off dates (a date beats its weekday, which
// beats the usual day). The clock is fixed to past dates so the emulator's
// sign-in tokens stay valid. See index.html scheduleFor()/dayDifference()/
// openDayEditor()/daySchedulePlain().
import { test, expect } from '@playwright/test';
import {
  setupNewClass, skipTourIfPresent, orgId, openTab, startClass, readAs, reportsReady,
} from './helpers.mjs';

async function classAt(page, when) {
  await page.clock.install({ time: new Date(when) });
  await page.goto('/?emulator=1');
  await setupNewClass(page, 'Ustadh Schedule', ['Amina', 'Bilal']);
  await skipTourIfPresent(page);
  return orgId(page);
}
// Fills the open schedule editor and saves it.
async function fillDay(page, { different, start, end, breaks, note } = {}) {
  if (different) await page.getByRole('button', { name: /^Different on/ }).click();
  if (start) await page.getByLabel('Class starts').fill(start);
  if (end) await page.getByLabel('Class ends').fill(end);
  if (breaks) {
    while (await page.locator('.sheet .brow2').count()) await page.locator('.sheet .brow2 .rmv').first().click();
    for (const [i, [n, s, e]] of breaks.entries()) {
      await page.locator('.sheet').getByRole('button', { name: '+ Add a break' }).click();
      const row = page.locator('.sheet .brow2').nth(i);
      await row.locator('.bname').fill(n);
      await row.locator('input[type=time]').nth(0).fill(s);
      await row.locator('input[type=time]').nth(1).fill(e);
    }
  }
  if (note) await page.getByLabel('Note').fill(note);
  await page.locator('.sheet').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#scrim')).not.toHaveClass(/show/);
}
async function editRow(page, rowSel, opts) {
  await openTab(page, 'settings');
  await page.locator(rowSel).getByRole('button', { name: 'Edit' }).click();
  await fillDay(page, opts);
}
const header = (page) => page.locator('#sub');
const at = async (page, when) => { await page.clock.setSystemTime(new Date(when)); await page.evaluate(() => { fitHeader.key = null; render(); if (TAB === 'settings') drawSettings(); }); };

test('a weekday can differ, a single date beats its weekday, and other days keep the usual times', async ({ page }) => {
  test.setTimeout(90000);
  const code = await classAt(page, '2026-09-24T07:00:00');                    // a Thursday
  await expect(header(page)).toHaveText('Before class · 8:00 AM-3:30 PM');
  await editRow(page, '.srow[data-day="5"]', { different: true, end: '13:30', breaks: [['Snack', '10:10', '10:20']] });
  await expect(page.locator('.srow[data-day="5"]')).toContainText('Early dismissal');
  await expect(page.locator('.srow[data-day="4"]')).toContainText('Usual day');
  await expect.poll(() => readAs(page, `orgs/${code}/classes/default`).then(d => d.settingsOverride && d.settingsOverride.schedule.days['5'].end), { timeout: 10000 }).toBe('13:30');
  // the first class still mirrors its usual day to org.defaults, for older versions
  expect((await readAs(page, `orgs/${code}`)).defaults.endTime).toBe('15:30');

  await openTab(page, 'log');
  await at(page, '2026-09-25T07:00:00');                                        // Friday: the weekday override
  await expect(header(page)).toHaveText('Before class · 8:00 AM-1:30 PM');
  await expect(page.locator('#dayDiff')).toHaveText('Friday: early dismissal at 1:30 PM. No lunch and recess.');

  // just this Friday: earlier still, with a note
  await openTab(page, 'settings');
  await page.getByRole('button', { name: '+ Change one date' }).click();
  await page.getByLabel('Date', { exact: true }).fill('2026-09-25');
  await fillDay(page, { end: '12:00', breaks: [], note: 'Parent meetings' });
  await expect(page.locator('.srow[data-date="2026-09-25"]')).toContainText('Once');
  await openTab(page, 'log');
  await expect(header(page)).toHaveText('Before class · 8:00 AM-12:00 PM');
  await expect(page.locator('#dayDiff')).toHaveText('Friday: Parent meetings');

  await at(page, '2026-10-02T07:00:00');                                        // the next Friday: the weekday again
  await expect(header(page)).toHaveText('Before class · 8:00 AM-1:30 PM');
  await at(page, '2026-10-01T07:00:00');                                        // a Thursday: the usual day
  await expect(header(page)).toHaveText('Before class · 8:00 AM-3:30 PM');
  await expect(page.locator('#dayDiff')).toHaveCount(0);
  await openTab(page, 'settings');
  await expect(page.locator('.srow[data-date="2026-09-25"]')).toHaveCount(0);  // past dates drop off the list...
  expect((await readAs(page, `orgs/${code}/classes/default`)).settingsOverride.schedule.dates['2026-09-25'].note).toBe('Parent meetings');   // ...but stay saved
});

test("a named break gets its own banner, Start and End - and the ☰ menu's button", async ({ page }) => {
  test.setTimeout(90000);
  await classAt(page, '2026-09-23T12:50:00');                                   // a Wednesday
  await editRow(page, '.srow.usual', { breaks: [['Snack', '10:10', '10:20'], ["Jumu'ah", '13:00', '13:45']] });
  await openTab(page, 'log');
  await startClass(page);
  await expect(header(page)).toContainText("· next Jumu'ah 1:00 PM");
  await page.locator('.menu-btn[aria-label="Teacher menu"]').click();
  await expect(page.locator('#dbody .dbtn', { hasText: "Start Jumu'ah" })).toContainText('Scheduled 1:00 PM to 1:45 PM');
  await expect(page.locator('#dbody .dbtn', { hasText: 'Start snack' })).toBeVisible();
  await page.locator('.dhead .menu-btn').click();

  await at(page, '2026-09-23T13:05:00');
  await expect(page.locator('#banner')).toContainText("Jumu'ah is scheduled now, 1:00 PM to 1:45 PM.");
  await page.locator('#banner').getByRole('button', { name: "Start Jumu'ah" }).click();
  await page.locator('.sheet').getByRole('button', { name: "Start Jumu'ah" }).click();
  await expect(page.locator('#banner')).toContainText("Jumu'ah since");
  expect(await page.evaluate(() => [state.session.status, state.session.pauseLabel])).toEqual(['lunch', "Jumu'ah"]);
  await page.locator('#banner').getByRole('button', { name: "End Jumu'ah" }).click();
  expect(await page.evaluate(() => state.session.status)).toBe('live');
});

test("each day keeps the times it had: saved when class starts and when they change, and reports don't move later", async ({ page }) => {
  test.setTimeout(90000);
  const code = await classAt(page, '2026-09-22T08:00:00');                     // a Tuesday
  await startClass(page);
  const day = '2026-09-22';
  await expect.poll(() => readAs(page, `orgs/${code}/classes/default/days/${day}`).then(d => d && d.schedule && d.schedule.end), { timeout: 10000 }).toBe('15:30');
  expect((await readAs(page, `orgs/${code}/classes/default/days/${day}`)).schedule.breaks.map(b => b.name)).toEqual(['Snack', 'Lunch and recess']);

  // ☰ -> Change today's times, while class runs: today's day doc follows
  await at(page, '2026-09-22T09:00:00');
  await page.locator('.menu-btn[aria-label="Teacher menu"]').click();
  await page.locator('#dbody .dbtn', { hasText: "Change today's times" }).click();
  await fillDay(page, { end: '15:00' });
  await expect.poll(() => readAs(page, `orgs/${code}/classes/default/days/${day}`).then(d => d.schedule.end), { timeout: 10000 }).toBe('15:00');

  await at(page, '2026-09-22T15:30:00');
  await page.locator('#mainBtn').click();
  await page.locator('.sheet').getByRole('button', { name: 'End class' }).click();
  // the usual day changes afterwards...
  await editRow(page, '.srow.usual', { end: '12:00', breaks: [] });
  // ...and today's report still uses the times today had: 8:00-3:00 minus snack and lunch = 290 min
  await openTab(page, 'reports');
  await page.locator('.rdate[data-range="today"]').click();
  await reportsReady(page);
  await expect(page.locator('[data-card="class"] b')).toHaveText('4 h 50 min');
});
