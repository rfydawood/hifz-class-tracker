// A day's state must not outlive its day. The instant-paint cache
// (cache.lastClass) has no server round trip to correct it, so before this was
// stamped with a date the app reopened the next morning still showing the
// previous day's ended class, its absent marks and its tardy marks - the
// teacher's first real morning started with yesterday's attendance already on
// the board. See index.html loadFromCache()/DAY_STATE_ID.
import { test, expect } from '@playwright/test';

const STUDENTS = ['Amina', 'Bilal', 'Zayd'];

function cacheFor(dayStamp) {
  const students = STUDENTS.map((name, i) => ({ id: 's' + i, name, active: true }));
  const attendance = {};
  students.forEach((s) => { attendance[s.id] = { status: 'present', at: null, note: '' }; });
  attendance.s1 = { status: 'absent', at: null, note: 'Deactivated before class' };
  attendance.s2 = { status: 'tardy', at: Date.now(), note: 'Arrived 11:15 PM, 5 min after start' };
  return {
    day: dayStamp,
    teacher: 'Ustadh Rollover',
    students,
    settings: {},
    session: { status: 'ended', startedAt: Date.now() - 7200e3, endedAt: Date.now() - 60e3, lunchAt: null, pauseLabel: null, resumeAt: null },
    attendance,
    active: {},
    breaks: [{ sid: 's0', reason: 'washroom', startAt: Date.now() - 3600e3, endAt: Date.now() - 3000e3, dur: 600e3, over: 180e3, flag: true, allowMs: 420e3, assignedMin: null, overTrip: false }],
  };
}

const stamp = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function bootWithCache(page, dayStamp) {
  await page.addInitScript((cache) => {
    localStorage.setItem('cache.lastClass', JSON.stringify(cache));
  }, cacheFor(dayStamp));
  await page.goto('/index.html');
  await expect(page.locator('.tile', { hasText: 'Amina' })).toBeVisible();
}

test("yesterday's session does not carry into the new day", async ({ page }) => {
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  await bootWithCache(page, stamp(yesterday));

  // The roster and the teacher's name belong to the class, so they still paint
  // instantly - that is the whole point of the cache.
  await expect(page.locator('#title')).toHaveText("Ustadh Rollover's Hifz Class");
  for (const name of STUDENTS) await expect(page.locator('.tile', { hasText: name })).toBeVisible();

  // Everything that belongs to one day starts clean.
  await expect(page.locator('.banner')).not.toContainText('Class ended at');
  await expect(page.locator('.banner')).toContainText('Everyone is assumed present');
  await expect(page.locator('#sub')).toContainText('Before class');
  await expect(page.locator('#mainBtn')).toHaveText('Start class');
  await expect(page.locator('#cAbs')).toHaveText('0');            // yesterday's absent mark is gone
  await expect(page.locator('#cIn')).toHaveText(String(STUDENTS.length));
  await expect(page.locator('.tile')).toHaveCount(STUDENTS.length);
  await expect(page.locator('.tile.out')).toHaveCount(0);
  expect(await page.evaluate(() => state.breaks.length)).toBe(0);
});

test("the same day's session is still restored instantly", async ({ page }) => {
  await bootWithCache(page, stamp(new Date()));

  await expect(page.locator('.banner')).toContainText('Class ended at');
  await expect(page.locator('#mainBtn')).toHaveText('Start again');
  await expect(page.locator('#cAbs')).toHaveText('1');
  expect(await page.evaluate(() => state.breaks.length)).toBe(1);
});
