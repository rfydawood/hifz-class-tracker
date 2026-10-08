// 4.0.1: typing with the keyboard up sideways; "Delete forever" for archived
// classes; break limits as − / + steppers (minutes 1-30, trips 1-10 or No
// limit). Made-up names only. See index.html keepVisible()/typingBox(),
// askDeleteClass()/writeDeleteClass(), limitSteppers()/tripCap().
import { test, expect } from '@playwright/test';
import {
  setupNewClass, skipTourIfPresent, orgId, openTab, tileFor, startClass, logBreak, returnFromBreak,
  readAs, stepLimitTo,
} from './helpers.mjs';

async function newClass(page, names = ['Amina', 'Bilal']) {
  await page.goto('/?emulator=1');
  await setupNewClass(page, 'Ustadh Fixes', names);
  await skipTourIfPresent(page);
  return orgId(page);
}
// the box is on screen, inside the sheet's visible part, and so is Save
async function visibleWithKeyboard(page, box, button) {
  // keepVisible waits for the keyboard's slide, then scrolls smoothly - give it time on a busy machine
  await expect.poll(() => page.evaluate((box) => { const b = document.querySelector(box).getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight; }, box), { timeout: 4000 }).toBe(true);
  await page.waitForTimeout(300);
  const r = await page.evaluate(([box, button]) => {
    const b = document.querySelector(box).getBoundingClientRect(), s = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === button && x.offsetParent).getBoundingClientRect();
    return { box: [b.top, b.bottom], btn: [s.top, s.bottom], vh: innerHeight };
  }, [box, button]);
  expect(r.box[0], 'the text box is not above the screen').toBeGreaterThanOrEqual(0);
  expect(r.box[1], 'the text box is not under the keyboard').toBeLessThanOrEqual(r.vh);
  expect(r.btn[1], `${button} is reachable`).toBeLessThanOrEqual(r.vh + 0.5);
  expect(r.btn[0]).toBeGreaterThanOrEqual(0);
  // and the button doesn't sit on top of the box
  expect(r.btn[0] >= r.box[1] || r.btn[1] <= r.box[0], `${button} doesn't cover the box`).toBe(true);
}

test('sideways with the keyboard up, the box being typed in stays visible and Cancel/Save stay reachable', async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 805, height: 504 });
  await newClass(page);
  // Settings -> Schedule -> Usual day: a new break's name, at the bottom of the sheet
  await openTab(page, 'settings');
  await page.locator('.srow.usual').getByRole('button', { name: 'Edit' }).click();
  await page.locator('.sheet').getByRole('button', { name: '+ Add a break' }).click();
  await page.locator('.sheet .brow2 .bname').last().focus();
  await page.setViewportSize({ width: 805, height: 230 });                // the Android keyboard takes the rest
  await visibleWithKeyboard(page, '.sheet .brow2:last-of-type .bname', 'Save');
  await page.locator('.sheet .brow2 .bname').last().fill("Jumu'ah");
  await expect(page.locator('.sheet .brow2 .bname').last()).toHaveValue("Jumu'ah");

  // rename (a one-box sheet) and Add a class work the same way
  await page.setViewportSize({ width: 805, height: 504 });
  await page.locator('.sheet .actions').getByRole('button', { name: 'Cancel' }).click();
  await openTab(page, 'profile');
  await page.locator('.ccard.open .cmore').click();
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.locator('#className').focus();
  await page.setViewportSize({ width: 805, height: 230 });
  await visibleWithKeyboard(page, '#className', 'Save');
  await page.setViewportSize({ width: 805, height: 504 });
  await page.locator('.sheet .actions').getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: '+ Add a class' }).click();
  await page.getByRole('button', { name: '+ Add a break' }).click();
  await page.locator('#acCard .brow2 .bname').focus();
  await page.setViewportSize({ width: 805, height: 230 });
  await visibleWithKeyboard(page, '#acCard .brow2 .bname', 'Next');
});

test('break limits step through every minute from 1 to 30, and trips from 1 to 10 then No limit', async ({ page }) => {
  test.setTimeout(90000);
  const code = await newClass(page);
  await openTab(page, 'settings');
  const mins = page.locator('#viewSettings b[aria-label="Washroom minutes"]');
  const trips = page.locator('#viewSettings b[aria-label="Washroom trips"]');
  await expect(mins).toHaveText('7 min');
  await page.getByRole('button', { name: 'More Washroom minutes' }).click();
  await expect(mins).toHaveText('8 min');                                     // a number the old list didn't have
  await stepLimitTo(page, '#viewSettings', 'Washroom', 30);
  await page.getByRole('button', { name: 'More Washroom minutes' }).click();
  await expect(mins).toHaveText('30 min');                                    // 30 is the most
  await stepLimitTo(page, '#viewSettings', 'Washroom', 1);
  await page.getByRole('button', { name: 'Fewer Washroom minutes' }).click();
  await expect(mins).toHaveText('1 min');                                     // 1 is the least
  await stepLimitTo(page, '#viewSettings', 'Washroom', 4);
  await expect.poll(() => readAs(page, `orgs/${code}/classes/default`).then(d => d.settingsOverride && d.settingsOverride.limits.washroom.min), { timeout: 10000 }).toBe(4);

  await expect(trips).toHaveText('2/day');
  for (let n = 3; n <= 10; n++) { await page.getByRole('button', { name: 'More Washroom trips' }).click(); await expect(trips).toHaveText(`${n}/day`); }
  await page.getByRole('button', { name: 'More Washroom trips' }).click();
  await expect(trips).toHaveText('No limit');
  await page.getByRole('button', { name: 'More Washroom trips' }).click();
  await expect(trips).toHaveText('No limit');
  await page.getByRole('button', { name: 'Fewer Washroom trips' }).click();
  await expect(trips).toHaveText('10/day');
  await page.getByRole('button', { name: 'More Washroom trips' }).click();
  await expect.poll(() => readAs(page, `orgs/${code}/classes/default`).then(d => d.settingsOverride.limits.washroom.trips), { timeout: 10000 }).toBe(99);
  // the minimum is 1 trip
  const t = await page.evaluate(() => { const l = { min: 7, trips: 2 }; l.trips = stepped(l, 'trips', -1); const one = l.trips; l.trips = stepped(l, 'trips', -1); return [one, l.trips]; });
  expect(t).toEqual([1, 1]);
});

test('with No limit, trips are never flagged for being one too many', async ({ page }) => {
  test.setTimeout(90000);
  await newClass(page);
  await openTab(page, 'settings');
  for (let i = 0; i < 9; i++) await page.getByRole('button', { name: 'More Washroom trips' }).click();   // 2 -> No limit
  await expect(page.locator('#viewSettings b[aria-label="Washroom trips"]')).toHaveText('No limit');
  await openTab(page, 'log');
  await startClass(page);
  for (let i = 0; i < 3; i++) { await logBreak(page, 'Amina', 'Washroom'); await returnFromBreak(page, 'Amina'); }
  expect(await page.evaluate(() => state.breaks.map(b => b.overTrip))).toEqual([false, false, false]);
  await tileFor(page, 'Amina').click();
  await expect(page.locator('.reason', { hasText: 'Washroom' })).toContainText('no trip limit');
  await expect(page.locator('.reason', { hasText: 'Washroom' })).not.toHaveClass(/capped/);
});

test('Add a class -> Set different limits uses the same steppers', async ({ page }) => {
  test.setTimeout(90000);
  const code = await newClass(page);
  await openTab(page, 'profile');
  await page.getByRole('button', { name: '+ Add a class' }).click();
  await page.locator('#acName').fill('Period 12');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.locator('#acStudent').fill('Yusuf'); await page.locator('#acStudent').press('Enter');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByText('Set different limits').click();
  await stepLimitTo(page, '#acCard', 'Water', 13);
  for (let i = 0; i < 9; i++) await page.locator('#acCard').getByRole('button', { name: 'More Water trips' }).click();
  await expect(page.locator('#acCard b[aria-label="Water trips"]')).toHaveText('No limit');
  await expect(page.locator('.acsum')).toContainText('Water 13 min, no trip limit');
  await page.getByRole('button', { name: 'Create Period 12' }).click();
  const cid = await page.evaluate(() => state.classes.find(c => c.name === 'Period 12').id);
  await expect.poll(() => readAs(page, `orgs/${code}/classes/${cid}`).then(d => d && d.settingsOverride.limits.water), { timeout: 10000 }).toEqual({ min: 13, trips: 99 });
});

// Profile -> + Add a class with typed names (helper, as in classes.spec.mjs)
async function addClass(page, name, names) {
  await openTab(page, 'profile');
  await page.getByRole('button', { name: '+ Add a class' }).click();
  await page.locator('#acName').fill(name);
  await page.getByRole('button', { name: 'Next' }).click();
  for (const n of names) { await page.locator('#acStudent').fill(n); await page.locator('#acStudent').press('Enter'); }
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: `Create ${name}` }).click();
  return page.evaluate((n) => state.classes.find(c => c.name === n).id, name);
}
async function archive(page, name) {
  await openTab(page, 'profile');
  await page.locator('.ccard', { hasText: name }).locator('.cmore').click();
  await page.getByRole('button', { name: /^Archive/ }).click();
  await page.locator('.sheet').getByRole('button', { name: 'Archive', exact: true }).click();
  await page.getByRole('button', { name: /Show archived/ }).click();
}
const gone = (page, path) => readAs(page, path).then(d => d === null);

test('Delete forever: only archived classes offer it; a class with no days takes one confirm', async ({ page }) => {
  test.setTimeout(90000);
  const code = await newClass(page);
  const cid = await addClass(page, 'Period 13', ['Yusuf', 'Zayd']);
  await expect(page.getByRole('button', { name: 'Delete forever' })).toHaveCount(0);      // active classes never show it
  await page.locator('.ccard', { hasText: 'Period 13' }).locator('.cmore').click();
  await expect(page.locator('.sheet')).not.toContainText('Delete');
  await page.locator('.sheet .actions').getByRole('button', { name: 'Close' }).click();

  await archive(page, 'Period 13');
  await page.locator('.ccard.gone', { hasText: 'Period 13' }).getByRole('button', { name: 'Delete forever' }).click();
  await expect(page.locator('.sheet h3')).toHaveText('Delete Period 13 forever?');
  await expect(page.locator('.sheet')).toContainText('It has no recorded days.');
  await page.locator('.sheet').getByRole('button', { name: 'Cancel' }).click();
  expect(await readAs(page, `orgs/${code}/classes/${cid}`)).toMatchObject({ status: 'archived' });   // Cancel changes nothing

  await page.locator('.ccard.gone', { hasText: 'Period 13' }).getByRole('button', { name: 'Delete forever' }).click();
  await page.locator('.sheet').getByRole('button', { name: 'Delete forever' }).click();
  await expect(page.locator('#toastMsg')).toHaveText('Period 13 deleted');
  await expect(page.locator('.ccard', { hasText: 'Period 13' })).toHaveCount(0);
  expect(await gone(page, `orgs/${code}/classes/${cid}`)).toBe(true);
  expect(await gone(page, `orgs/${code}/classes/${cid}/students/s0`)).toBe(true);
  expect(await readAs(page, `orgs/${code}/classes/default`)).toMatchObject({ status: 'active' });   // the first class untouched
});

test('Delete forever with records: counts them, waits for "I understand", then deletes students, days and breaks', async ({ page }) => {
  test.setTimeout(120000);
  const code = await newClass(page);
  const cid = await addClass(page, 'Period 14', ['Yusuf']);
  await page.locator('.ccard', { hasText: 'Period 14' }).getByRole('button', { name: 'Open' }).click();
  await startClass(page);
  await logBreak(page, 'Yusuf', 'Water');
  await returnFromBreak(page, 'Yusuf');
  await page.locator('#mainBtn').click();
  await page.locator('.sheet').getByRole('button', { name: 'End class' }).click();
  const today = await page.evaluate(() => dayId(new Date()));
  await expect.poll(() => readAs(page, `orgs/${code}/classes/${cid}/days/${today}`).then(d => d && d.session.status), { timeout: 10000 }).toBe('ended');
  await openTab(page, 'profile');
  await page.locator('.ccard', { hasText: "Ustadh Fixes's Hifz Class" }).getByRole('button', { name: 'Open' }).click();
  await archive(page, 'Period 14');

  await page.locator('.ccard.gone', { hasText: 'Period 14' }).getByRole('button', { name: 'Delete forever' }).click();
  await expect(page.locator('.sheet')).toContainText("1 student and 1 recorded day will be deleted. This can't be undone.");
  await expect(page.locator('.sheet')).toContainText('download a backup first');
  const go = page.locator('#delGo');
  await expect(go).toBeDisabled();
  await page.getByText("I understand this can't be undone").click();
  await expect(go).toBeEnabled();
  await go.click();
  await expect(page.locator('#toastMsg')).toHaveText('Period 14 deleted');
  expect(await gone(page, `orgs/${code}/classes/${cid}`)).toBe(true);
  expect(await gone(page, `orgs/${code}/classes/${cid}/students/s0`)).toBe(true);
  expect(await gone(page, `orgs/${code}/classes/${cid}/days/${today}`)).toBe(true);
  const left = await page.evaluate(async ([code, cid, today]) => (await orgRefFor(code).collection('classes').doc(cid).collection('days').doc(today).collection('breaks').get()).size, [code, cid, today]);
  expect(left).toBe(0);
});
