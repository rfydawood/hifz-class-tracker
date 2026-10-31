// 4.3.1: a usual time for "Other". Settings -> Break limits gets an Other row
// (minutes only, no trip limit) stored in the existing settings.longMin; the
// Other stepper starts there, locked or not; Add a class step 3 sets it too.
// Flagging is unchanged: running over the time set for the trip is flagged,
// and Other has no trip cap. See index.html otherStepper(), openMinutesSheet().
// Made-up names only.
import { test, expect } from '@playwright/test';
import { setupNewClass, skipTourIfPresent, orgId, openTab, tileFor, startClass, readAs } from './helpers.mjs';

const PIN = '2468';

async function newClass(page, students = ['Idris M.', 'Sami K.', 'Talha N.']) {
  await page.goto('/?emulator=1');
  await setupNewClass(page, 'Ustadh Naeem', students);
  await skipTourIfPresent(page);
  return orgId(page);
}
const otherRow = (page) => page.locator('#otherLimField');
async function setOtherInSettings(page, minutes) {
  await openTab(page, 'settings');
  for (let i = 0; i < 30; i++) {
    const now = +(await otherRow(page).locator('b').textContent()).replace(/\D/g, '');
    if (now === minutes) break;
    await otherRow(page).getByRole('button', { name: now < minutes ? 'More Other minutes' : 'Fewer Other minutes' }).click();
  }
  await expect(otherRow(page).locator('b')).toHaveText(`${minutes} min`);
  await openTab(page, 'log');
}
const otherReason = (page) => page.locator('.reason', { hasText: 'Other' });
async function startOther(page, name) {
  await tileFor(page, name).click();
  await otherReason(page).click();
  await page.getByRole('button', { name: `Start ${name}'s break` }).click();
  await expect(tileFor(page, name)).toHaveClass(/out/);
}
async function returnOther(page, name) {
  await tileFor(page, name).click();
  await page.getByRole('button', { name: `Return ${name}` }).click();
  await expect(tileFor(page, name)).not.toHaveClass(/out/);
}
// state.active is keyed by student id
const activeOf = (page, name) => page.evaluate((n) => { const e = Object.entries(state.active).find(([sid]) => nameOf(sid) === n); return e && e[1]; }, name);
// move the saved start time back, the way time passing would
const backdate = (page, name, mins) => page.evaluate(async ([n, m]) => {
  const a = Object.entries(state.active).find(([sid]) => nameOf(sid) === n)[1];
  await dayRef().collection('breaks').doc(a._id).update({ startAt: Date.now() - m * 60000 });
}, [name, mins]);
async function typePin(page, pin = PIN) {
  for (const d of pin) await page.locator('.pinkey').filter({ hasText: new RegExp(`^${d}$`) }).click();
}

test('Settings shows Other at 10 min; + sets settings.longMin, which survives a reload', async ({ page }) => {
  test.setTimeout(90000);
  const code = await newClass(page);
  await openTab(page, 'settings');
  await expect(otherRow(page)).toContainText('Other');
  await expect(otherRow(page)).toContainText('Expected minutes · no trip limit');
  await expect(otherRow(page).locator('b')).toHaveText('10 min');
  await otherRow(page).getByRole('button', { name: 'More Other minutes' }).click();
  await otherRow(page).getByRole('button', { name: 'More Other minutes' }).click();
  await expect(otherRow(page).locator('b')).toHaveText('12 min');
  expect(await page.evaluate(() => state.settings.longMin)).toBe(12);
  await page.waitForTimeout(2000);                                         // saved to the cloud
  await page.reload();
  await page.waitForFunction((c) => window.__hifzOrgId === c && window.__hifzSyncStatus === 'synced', code, { timeout: 20000 });
  await expect.poll(() => page.evaluate(() => state.settings.longMin), { timeout: 10000 }).toBe(12);
  await openTab(page, 'settings');
  await expect(otherRow(page).locator('b')).toHaveText('12 min');
  // the stepper stays within 1-30
  for (let i = 0; i < 25; i++) await otherRow(page).getByRole('button', { name: 'More Other minutes' }).click();
  await expect(otherRow(page).locator('b')).toHaveText('30 min');
});

test('a new Other break starts at the usual time, unlocked and locked', async ({ page }) => {
  test.setTimeout(120000);
  await newClass(page);
  await setOtherInSettings(page, 12);
  await startClass(page);
  // unlocked
  await tileFor(page, 'Idris M.').click();
  await expect(otherReason(page)).toContainText('about 12 min expected');
  await otherReason(page).click();
  await expect(page.locator('#minDisplay')).toHaveText('12');
  await page.getByRole('button', { name: "Start Idris M.'s break" }).click();
  await expect(tileFor(page, 'Idris M.')).toHaveClass(/out/);
  await page.waitForTimeout(2500);                                         // saved, confirmed, re-read
  expect((await activeOf(page, 'Idris M.')).allowMs).toBe(12 * 60000);
  // locked: set a PIN, lock, and the student starts Other at 12 with no way to change it
  await page.locator('#lockTab').click();
  await typePin(page); await typePin(page);
  await expect(page.locator('#scrim')).not.toHaveClass(/show/);
  await page.locator('#lockTab').click();
  await expect(page.locator('#lockLbl')).toHaveText('Locked');
  await tileFor(page, 'Sami K.').click();
  await expect(otherReason(page)).toContainText('about 12 min expected');
  await otherReason(page).click();
  await expect(page.locator('#minDisplay')).toHaveText('12');
  await expect(page.locator('.minlocked')).toContainText('only the teacher can change this');
  await expect(page.getByRole('button', { name: 'More minutes' })).toHaveCount(0);
  await page.getByRole('button', { name: "Start Sami K.'s break" }).click();
  await expect(tileFor(page, 'Sami K.')).toHaveClass(/out/);
  await expect(page.locator('#lockLbl')).toHaveText('Locked');
  await page.waitForTimeout(2500);
  expect((await activeOf(page, 'Sami K.')).allowMs).toBe(12 * 60000);
});

test('flagging is unchanged: over the time is flagged, within it is not, and Other has no trip cap', async ({ page }) => {
  test.setTimeout(120000);
  await newClass(page);
  await setOtherInSettings(page, 12);
  await startClass(page);
  // over: 20 minutes on a 12-minute Other
  await startOther(page, 'Idris M.');
  await page.waitForTimeout(2500);
  await backdate(page, 'Idris M.', 20);
  await expect(tileFor(page, 'Idris M.')).toHaveClass(/long/, { timeout: 5000 });
  await returnOther(page, 'Idris M.');
  await page.waitForTimeout(2500);
  let b = await page.evaluate(() => state.breaks.find(x => nameOf(x.sid) === 'Idris M.'));
  expect(b.reason).toBe('other');
  expect(b.flag).toBe(true);
  expect(Math.round(b.over / 60000)).toBe(8);
  // within: 5 minutes on 12
  await startOther(page, 'Sami K.');
  await page.waitForTimeout(2500);
  await backdate(page, 'Sami K.', 5);
  await page.waitForTimeout(1500);
  await expect(tileFor(page, 'Sami K.')).not.toHaveClass(/long/);
  await returnOther(page, 'Sami K.');
  await page.waitForTimeout(2500);
  b = await page.evaluate(() => state.breaks.find(x => nameOf(x.sid) === 'Sami K.'));
  expect(b.flag).toBe(false);
  expect(b.over).toBe(0);
  // no trip cap: several Other trips, never "over daily limit"
  for (let i = 0; i < 4; i++) { await startOther(page, 'Talha N.'); await returnOther(page, 'Talha N.'); }
  await tileFor(page, 'Talha N.').click();
  await expect(otherReason(page)).not.toHaveClass(/capped/);
  await expect(otherReason(page)).not.toContainText('over daily limit');
  await expect(otherReason(page)).toContainText('about 12 min expected');
});

test('Add a class step 3 sets Other for the new class; "Same as" takes the first class\'s', async ({ page }) => {
  test.setTimeout(120000);
  const code = await newClass(page);
  await setOtherInSettings(page, 12);
  const add = async (name, own) => {
    await openTab(page, 'profile');
    await page.getByRole('button', { name: '+ Add a class' }).click();
    await expect(page.locator('#acName')).toBeFocused();
    await page.locator('#acName').fill(name);
    await page.getByRole('button', { name: 'Next' }).click();
    await page.locator('#acStudent').fill('Umar F.'); await page.locator('#acStudent').press('Enter');
    await page.getByRole('button', { name: 'Next' }).click();
    const card = page.locator('#acCard');
    await expect(card).toContainText('Other about 12 min');                // "Same as" line includes Other
    if (own) {
      await page.getByText('Set different limits').click();
      const row = card.locator('.field.lim', { hasText: 'Expected minutes · no trip limit' });
      await expect(row).toContainText('Other');
      await expect(row.locator('b')).toHaveText('12 min');
      for (let i = 0; i < 3; i++) await row.getByRole('button', { name: 'More Other minutes' }).click();
      await expect(row.locator('b')).toHaveText('15 min');
      await expect(card.locator('.acsum')).toContainText('Other about 15 min');
    }
    await page.getByRole('button', { name: `Create ${name}` }).click();
    await expect(page.locator('#toastMsg')).toHaveText(`${name} is ready. Open it when its class starts.`);
    return page.evaluate((n) => state.classes.find(c => c.name === n).id, name);
  };
  const own = await add('Period 6', true);
  await expect.poll(() => readAs(page, `orgs/${code}/classes/${own}`).then(d => d && d.settingsOverride && d.settingsOverride.longMin), { timeout: 10000 }).toBe(15);
  const same = await add('Period 7', false);
  await expect.poll(() => readAs(page, `orgs/${code}/classes/${same}`).then(d => d && d.settingsOverride && d.settingsOverride.longMin), { timeout: 10000 }).toBe(12);
  // the first class keeps its own
  expect(await page.evaluate(() => state.settings.longMin)).toBe(12);
});
