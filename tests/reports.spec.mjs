// The Reports tab's numbers, from days seeded in the cloud for last week
// (Monday to Sunday). Covers the counting rules in index.html crunch() and
// classMinutes():
// - a break under 15 seconds is an accidental tap and is not counted
// - "assigned" counts as a break but not as time out of class
// - class time is start to end minus snack and lunch; a start in the middle of
//   the night uses the scheduled start, and a missing end or one after class
//   hours uses the scheduled end
// Class hours are the defaults: 8:00-3:30, snack 10:10-10:20, lunch 12:05-2:05.
import { test, expect } from '@playwright/test';
import {
  setupNewClass, skipTourIfPresent, orgId, openTab, reportsReady, seedFirestoreDay,
} from './helpers.mjs';

test('Reports add up seeded days correctly, by total and by daily average', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/?emulator=1');
  await setupNewClass(page, 'Ustadh Numbers', ['Amina', 'Bilal']);
  await skipTourIfPresent(page);
  await orgId(page);

  const ids = await page.evaluate(() => { const s = rangeOf('lastweek').start; return [0, 1, 2].map(n => dayId(addDays(s, n))); });
  const at = (id, hh, mm) => page.evaluate(([id, hh, mm]) => +new Date(`${id}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`), [id, hh, mm]);
  const p = (s) => ({ status: s, at: null, note: '' });
  const br = (sid, reason, sec, flag = false) => ({ sid, reason, startAt: null, endAt: null, dur: sec * 1000, over: flag ? 60000 : 0, flag, overTrip: false, assignedMin: null });
  const seed = (id, session, att, breaks) => seedFirestoreDay(page, id, att, breaks, session);
  // Monday: a normal day, 8:00 to 3:30 -> 450 - 10 - 120 = 320 min
  await seed(ids[0], { startedAt: await at(ids[0], 8, 0), endedAt: await at(ids[0], 15, 30) },
    { s0: p('present'), s1: p('present') },
    [br('s0', 'washroom', 360), br('s1', 'water', 180, true), br('s0', 'water', 10)]);       // the 10 s one is a mis-tap
  // Tuesday: restarted at 9 at night and never ended -> the scheduled day, 320 min
  await seed(ids[1], { startedAt: await at(ids[1], 21, 0), endedAt: null },
    { s0: p('present'), s1: p('absent') },
    [br('s0', 'assigned', 300), br('s0', 'wudhu', 120)]);
  // Wednesday: 7:30 (within the hour) to 4:30 (after class) -> 7:30 to 3:30 = 480 - 130 = 350 min
  await seed(ids[2], { startedAt: await at(ids[2], 7, 30), endedAt: await at(ids[2], 16, 30) },
    { s0: p('tardy'), s1: p('left') },
    [br('s1', 'washroom', 540, true), br('s0', 'other', 240)]);

  await openTab(page, 'reports');
  await page.locator('.rdate[data-range="lastweek"]').click();
  await reportsReady(page);
  const card = (id) => page.locator(`[data-card="${id}"]`);

  await expect(page.locator('#rptLine')).toContainText('Whole class · 2 students');
  await expect(page.locator('#rptLine')).toContainText('3 class days');
  await expect(card('class').locator('b')).toHaveText('16 h 30 min');           // 320 + 320 + 350 = 990 min
  await expect(card('class')).toContainText('3 class days, lunch and snack not counted');
  // 6 + 3 + 2 + 9 + 4 = 24 min; the 5 min assigned trip and the 10 s tap are not time out
  await expect(card('out').locator('b')).toHaveText('24 min');
  // 24 of 1660 student-minutes in class (320x2 + 320x1 + 350x2)
  await expect(card('out')).toContainText('1.4% of class time');
  await expect(card('out')).toContainText('No class days the week before to compare');
  await expect(card('breaks').locator('b')).toHaveText('6');                     // not 7: the 10 s tap is ignored
  await expect(card('breaks')).toContainText('Typical length 4.5 min');         // median of 2, 3, 4, 5, 6, 9
  await expect(card('over').locator('b')).toHaveText('2');
  await expect(card('over')).toContainText('33% of all breaks');
  await expect(card('att').locator('b')).toHaveText('83% present');             // 5 of 6
  await expect(card('att')).toContainText('1 tardy · 1 absent · 1 left early');

  // where the time went: the assigned trip shows, marked excused; one water trip, not two
  await expect(page.locator('.dleg [data-type="assigned"]')).toContainText('Assigned (excused)');
  await expect(page.locator('.dleg [data-type="assigned"]')).toContainText('5 min');
  await expect(page.locator('.dleg [data-type="water"]')).toContainText('1 trip');
  await expect(page.locator('.dleg [data-type="water"]')).not.toContainText('2 trips');
  await expect(page.locator('.worth')).toContainText('Bilal had the most over-limit breaks: 2 of 2 trips.');
  await expect(page.locator('.worth')).toContainText('A typical washroom trip took 7.5 min, over the 7 min limit (2 trips).');

  // daily average: per class day
  await page.getByRole('button', { name: 'Daily average' }).click();
  await expect(card('class').locator('b')).toHaveText('5 h 30 min a day');      // 990 / 3
  await expect(card('out').locator('b')).toHaveText('8 min a day');
  await expect(card('breaks').locator('b')).toHaveText('2 a day');
  await expect(card('over').locator('b')).toHaveText('0.7 a day');

  // one student: Amina (s0) - 6 + 2 + 4 = 12 min out; assigned not counted
  await page.getByRole('button', { name: 'Total' }).click();
  await page.getByRole('button', { name: 'One student' }).click();
  await expect(page.locator('#rptLine')).toContainText('Amina');
  await expect(card('out').locator('b')).toHaveText('12 min');
  await expect(card('breaks').locator('b')).toHaveText('4');
  await expect(card('att').locator('b')).toHaveText('100% present');
  await expect(page.locator('.dlist .row')).toHaveCount(3);
});

test('a bar in the chart shows its breakdown, then opens that student', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/?emulator=1');
  await setupNewClass(page, 'Ustadh Bars', ['Amina', 'Bilal']);
  await skipTourIfPresent(page);
  await orgId(page);
  const id = await page.evaluate(() => dayId(rangeOf('lastweek').start));
  await seedFirestoreDay(page, id, { s0: { status: 'present', at: null, note: '' }, s1: { status: 'present', at: null, note: '' } },
    [{ sid: 's1', reason: 'washroom', startAt: null, endAt: null, dur: 240000, over: 0, flag: false, overTrip: false, assignedMin: null }]);
  await openTab(page, 'reports');
  await page.locator('.rdate[data-range="lastweek"]').click();
  await reportsReady(page);
  const bilal = page.locator('#chart1 rect.hit').nth(1);
  await bilal.click();
  await expect(page.locator('.bdown')).toContainText('Bilal · 4 min out');
  await expect(page.locator('.bdown')).toContainText('Washroom 4 min (1 trip)');
  await bilal.click();
  await expect(page.locator('#rptLine')).toContainText('Bilal');
  await expect(page.locator('#viewReports select')).toHaveValue('s1');
});
