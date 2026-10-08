// 4.0 Part B - My classes: more than one class per teacher, ONE open at a
// time. Log, Reports, Roster and Settings only ever show the open class;
// the only way to see another is to open it from Profile. Made-up names only.
// See index.html "My classes (4.0)": switchClass(), writeClass(), paintProfile().
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  setupNewClass, skipTourIfPresent, orgId, openTab, tileFor, startClass, logBreak, readAs,
  reportsReady, writeCount, stepLimitTo,
} from './helpers.mjs';

async function firstClass(page, names = ['Amina', 'Bilal']) {
  await page.goto('/?emulator=1');
  await setupNewClass(page, 'Ustadh Classes', names);
  await skipTourIfPresent(page);
  return orgId(page);
}
// Profile -> + Add a class, through the three steps
async function addClass(page, name, { names, copyFrom, ownLimits } = {}) {
  await openTab(page, 'profile');
  await page.getByRole('button', { name: '+ Add a class' }).click();
  await page.locator('#acName').fill(name);
  await page.getByRole('button', { name: 'Next' }).click();
  if (copyFrom) {
    await page.getByRole('button', { name: 'Copy from another class' }).click();
    await page.locator('#acCopy').selectOption({ label: copyFrom });
    await expect(page.locator('#acCount')).not.toHaveText('0 students');
  } else {
    for (const n of names) { await page.locator('#acStudent').fill(n); await page.locator('#acStudent').press('Enter'); }
    await expect(page.locator('#acCount')).toHaveText(`${names.length} student${names.length === 1 ? '' : 's'}`);
  }
  await page.getByRole('button', { name: 'Next' }).click();
  if (ownLimits) {
    await page.getByText('Set different limits').click();
    await stepLimitTo(page, '#acCard', 'Washroom', ownLimits);
  }
  await page.getByRole('button', { name: `Create ${name}` }).click();
  await expect(page.locator('#toastMsg')).toHaveText(`${name} is ready. Open it when its class starts.`);
  await expect(page.locator(`.ccard`, { hasText: name })).toBeVisible();
  return page.evaluate((n) => state.classes.find(c => c.name === n).id, name);
}
const openFromProfile = async (page, name) => {
  await openTab(page, 'profile');
  await page.locator('.ccard', { hasText: name }).getByRole('button', { name: 'Open' }).click();
};

test('a second class is created with typed names, and only appears on Log once it is opened', async ({ page }) => {
  test.setTimeout(90000);
  const code = await firstClass(page);
  const cid = await addClass(page, 'Period 5', { names: ['Yusuf', 'Zayd', 'Hamza'] });
  // created: class doc and students, in the cloud
  await expect.poll(() => readAs(page, `orgs/${code}/classes/${cid}`).then(d => d && d.name), { timeout: 10000 }).toBe('Period 5');
  const doc = await readAs(page, `orgs/${code}/classes/${cid}`);
  expect(doc.status).toBe('active');
  expect(doc.settingsOverride.classDays).toEqual([1, 2, 3, 4, 5]);
  expect(await readAs(page, `orgs/${code}/classes/${cid}/students/s2`)).toMatchObject({ name: 'Hamza', active: true, order: 2 });
  // still on Profile, still the first class
  await expect(page.locator('.app')).toHaveAttribute('data-tab', 'profile');
  await expect(page.locator('.ccard.open')).toContainText("Ustadh Classes's Hifz Class");
  await expect(page.locator('.ccard', { hasText: 'Period 5' })).toContainText('Mon–Fri · 8:00 AM–3:30 PM · 3 students');
  await openTab(page, 'log');
  await expect(tileFor(page, 'Amina')).toBeVisible();
  await expect(tileFor(page, 'Yusuf')).toHaveCount(0);

  await openFromProfile(page, 'Period 5');
  await expect(page.locator('#toastMsg')).toHaveText('Period 5 is open');
  await expect(page.locator('.app')).toHaveAttribute('data-tab', 'log');
  await expect(page.locator('#title')).toHaveText('Period 5');
  await expect(tileFor(page, 'Yusuf')).toBeVisible();
  await expect(tileFor(page, 'Amina')).toHaveCount(0);
  await openTab(page, 'settings');
  await expect(page.locator('#viewSettings .cpill')).toHaveText('Period 5');
});

test('a class can copy its students from another class, as new students of its own', async ({ page }) => {
  test.setTimeout(90000);
  const code = await firstClass(page, ['Amina', 'Bilal', 'Maryam']);
  const cid = await addClass(page, 'Period 6', { copyFrom: "Ustadh Classes's Hifz Class", ownLimits: 3 });
  await expect.poll(() => readAs(page, `orgs/${code}/classes/${cid}/students/s2`).then(d => d && d.name), { timeout: 10000 }).toBe('Maryam');
  expect((await readAs(page, `orgs/${code}/classes/${cid}`)).settingsOverride.limits.washroom.min).toBe(3);
  await openFromProfile(page, 'Period 6');
  await expect(tileFor(page, 'Maryam')).toBeVisible();
  await openTab(page, 'settings');
  await expect(page.locator('#viewSettings b[aria-label="Washroom minutes"]')).toHaveText('3 min');          // its own limits
  await openFromProfile(page, "Ustadh Classes's Hifz Class");
  await openTab(page, 'settings');
  await expect(page.locator('#viewSettings b[aria-label="Washroom minutes"]')).toHaveText('7 min');          // the first class's, untouched
});

test('isolation: Log, Roster, Reports and the CSV of one class never show the other class', async ({ page }) => {
  test.setTimeout(120000);
  await firstClass(page, ['Amina', 'Bilal']);
  await startClass(page);
  await logBreak(page, 'Amina', 'Water');
  await page.waitForTimeout(16000);                                            // a break long enough to count
  await tileFor(page, 'Amina').click();
  await page.getByRole('button', { name: 'Return Amina' }).click();
  await addClass(page, 'Period 7', { names: ['Yusuf', 'Zayd'] });
  // ending the first class makes switching straight away
  await openTab(page, 'log');
  await page.locator('#mainBtn').click();
  await page.getByRole('button', { name: 'End class' }).last().click();
  await openFromProfile(page, 'Period 7');
  await startClass(page);
  await logBreak(page, 'Zayd', 'Washroom');
  await page.waitForTimeout(16000);
  await tileFor(page, 'Zayd').click();
  await page.getByRole('button', { name: 'Return Zayd' }).click();

  const others = ['Amina', 'Bilal'];
  for (const n of others) await expect(tileFor(page, n)).toHaveCount(0);
  await openTab(page, 'roster');
  await expect(page.locator('#viewRoster .rs')).toHaveCount(2);
  for (const n of others) await expect(page.locator('#viewRoster')).not.toContainText(n);
  await openTab(page, 'reports');
  await page.locator('.rdate[data-range="today"]').click();
  await reportsReady(page);
  await expect(page.locator('#rptLine')).toContainText('2 students');
  await expect(page.locator('#viewReports')).toContainText('Zayd');
  for (const n of others) await expect(page.locator('#viewReports')).not.toContainText(n);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^hifz-breaks-period-7-\d{4}-\d{2}-\d{2}-to-/);
  const csv = await readFile(await dl.path(), 'utf8');
  expect(csv).toContain('Zayd');
  for (const n of others) expect(csv).not.toContain(n);
});

test('opening another class while one is running: the sheet lists who is out, and ending it saves their breaks', async ({ page }) => {
  test.setTimeout(90000);
  const code = await firstClass(page, ['Amina', 'Bilal']);
  await addClass(page, 'Period 8', { names: ['Yusuf'] });
  await openTab(page, 'log');
  await startClass(page);
  await logBreak(page, 'Bilal', 'Water');
  await page.waitForTimeout(1500);
  await openFromProfile(page, 'Period 8');
  await expect(page.locator('.sheet h3')).toHaveText('Open Period 8?');
  await expect(page.locator('.sheet')).toContainText("Ustadh Classes's Hifz Class is still running.");
  await expect(page.locator('.sheet .row', { hasText: 'Bilal' })).toContainText('Water · out');
  await expect(page.locator('.sheet')).toContainText('They are marked back in and the class ends. You can resume it later today.');
  await page.getByRole('button', { name: 'Stay here' }).click();
  await expect(page.locator('.ccard.open')).toContainText("Ustadh Classes's Hifz Class");

  await page.locator('.ccard', { hasText: 'Period 8' }).getByRole('button', { name: 'Open' }).click();
  await page.getByRole('button', { name: 'Bring them back, end class and open Period 8' }).click();
  await expect(page.locator('#title')).toHaveText('Period 8');
  const today = await page.evaluate(() => dayId(new Date()));
  await expect.poll(() => readAs(page, `orgs/${code}/classes/default/days/${today}`).then(d => d && d.session.status), { timeout: 10000 }).toBe('ended');
  const breaks = await page.evaluate(async ([code, today]) => (await orgRefFor(code).collection('classes').doc('default').collection('days').doc(today).collection('breaks').get()).docs.map(d => d.data()), [code, today]);
  expect(breaks).toHaveLength(1);
  expect(breaks[0].sid).toBe('s1');
  expect(breaks[0].endAt).not.toBeNull();                                        // marked back in, saved
  // and the first class can be resumed later
  await openFromProfile(page, "Ustadh Classes's Hifz Class");
  await expect(page.locator('#mainBtn')).toHaveText('Resume class');
});

test('the app reopens the class that was open last', async ({ page }) => {
  test.setTimeout(90000);
  await firstClass(page);
  await addClass(page, 'Period 9', { names: ['Yusuf'] });
  await openFromProfile(page, 'Period 9');
  await expect(page.locator('#title')).toHaveText('Period 9');
  await page.reload();
  await expect(page.locator('#title')).toHaveText('Period 9', { timeout: 15000 });
  await expect(tileFor(page, 'Yusuf')).toBeVisible();
  await expect(tileFor(page, 'Amina')).toHaveCount(0);
});

test('rename, archive and restore a class; the open class cannot be archived; nothing is deleted', async ({ page }) => {
  test.setTimeout(90000);
  const code = await firstClass(page);
  const cid = await addClass(page, 'Period 10', { names: ['Yusuf'] });
  const card = (n) => page.locator('.ccard', { hasText: n });

  await card('Period 10').getByRole('button', { name: 'More for Period 10' }).click();
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.locator('#className').fill('Evening class');
  await page.locator('.sheet').getByRole('button', { name: 'Save' }).click();
  await expect(card('Evening class')).toBeVisible();
  await expect.poll(() => readAs(page, `orgs/${code}/classes/${cid}`).then(d => d.name), { timeout: 10000 }).toBe('Evening class');

  // the open class: Archive is not offered
  await page.locator('.ccard.open .cmore').click();
  await expect(page.locator('.sheet')).toContainText("The open class can't be archived.");
  await expect(page.locator('.sheet').getByRole('button', { name: /Archive/ })).toBeDisabled();
  await page.locator('.sheet .actions').getByRole('button', { name: 'Close' }).click();

  await card('Evening class').locator('.cmore').click();
  await page.getByRole('button', { name: /^Archive/ }).click();
  await page.locator('.sheet').getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.locator('.clist .ccard:not(.gone)', { hasText: 'Evening class' })).toHaveCount(0);
  await expect.poll(() => readAs(page, `orgs/${code}/classes/${cid}`).then(d => d.status), { timeout: 10000 }).toBe('archived');
  expect(await readAs(page, `orgs/${code}/classes/${cid}/students/s0`)).toMatchObject({ name: 'Yusuf' });   // kept

  await page.getByRole('button', { name: /Show archived/ }).click();
  await page.locator('.ccard.gone', { hasText: 'Evening class' }).getByRole('button', { name: 'Restore' }).click();
  await expect(page.locator('.ccard:not(.gone)', { hasText: 'Evening class' })).toBeVisible();
  await expect.poll(() => readAs(page, `orgs/${code}/classes/${cid}`).then(d => d.status), { timeout: 10000 }).toBe('active');
});

test('changes held before they could be sent go to the class they were made in, even after switching', async ({ page }) => {
  test.setTimeout(90000);
  const code = await firstClass(page);
  const cid = await addClass(page, 'Period 11', { names: ['Yusuf'] });
  await openFromProfile(page, 'Period 11');
  await startClass(page);
  await page.waitForTimeout(1000);
  // as if the connection to the account dropped: writes are held, not sent
  await page.evaluate(() => { window.__uid = fbUid; fbUid = null; });
  await logBreak(page, 'Yusuf', 'Water');
  expect(await page.evaluate(() => held.length)).toBe(1);
  await openTab(page, 'log');
  await page.locator('#mainBtn').click();
  await page.getByRole('button', { name: 'End class' }).last().click();          // also held, for Period 11
  await openFromProfile(page, "Ustadh Classes's Hifz Class");
  await expect(page.locator('#title')).toHaveText("Ustadh Classes's Hifz Class");
  await page.evaluate(() => { fbUid = window.__uid; sendHeld(); });
  const today = await page.evaluate(() => dayId(new Date()));
  const breaksIn = (c) => page.evaluate(async ([code, c, today]) => (await orgRefFor(code).collection('classes').doc(c).collection('days').doc(today).collection('breaks').get()).docs.map(d => d.data().sid), [code, c, today]);
  await expect.poll(() => breaksIn(cid), { timeout: 10000 }).toEqual(['s0']);
  expect(await breaksIn('default')).toEqual([]);
  await expect.poll(() => readAs(page, `orgs/${code}/classes/${cid}/days/${today}`).then(d => d && d.session.status), { timeout: 10000 }).toBe('ended');
});

test('opening 4.0 on a class made before it writes nothing, and leaves its settings where they were', async ({ page }) => {
  test.setTimeout(90000);
  const code = await firstClass(page);
  await page.waitForTimeout(1500);
  expect((await readAs(page, `orgs/${code}/classes/default`)).settingsOverride).toBeNull();
  await page.reload();
  await page.waitForFunction(() => window.__hifzSyncStatus === 'synced', null, { timeout: 20000 });
  await expect(tileFor(page, 'Amina')).toBeVisible();
  await page.waitForTimeout(4000);
  for (const t of ['profile', 'settings', 'reports', 'roster', 'log']) { await openTab(page, t); await page.waitForTimeout(300); }
  expect(await writeCount(page)).toBe(0);
  expect((await readAs(page, `orgs/${code}/classes/default`)).settingsOverride).toBeNull();
});
