// Teacher mode, 4.3: the loopholes closed. With a PIN set and the tablet
// locked, students keep exactly two things - start a break, and Return.
// Everything else asks for the PIN: does nothing if the PIN pad is closed,
// and goes ahead once the right PIN is typed. Plus auto-lock ("Lock again
// automatically", Off / 2 / 5 / 10 minutes). See index.html asTeacher(),
// LOCKED_TABS, autoLockCheck(). Made-up names only.
import { test, expect } from '@playwright/test';
import { setupNewClass, skipTourIfPresent, orgId, openTab, tileFor, startClass, logBreak } from './helpers.mjs';

const PIN = '2468';
const sheetTitle = (page) => page.locator('#sheet h3');
const tab = (page) => page.locator('.app').getAttribute('data-tab');

async function newClass(page, students = ['Bilal R.', 'Hamza T.', 'Yusuf K.']) {
  await page.goto('/?emulator=1');
  await setupNewClass(page, 'Ustadh Kareem', students);
  await skipTourIfPresent(page);
  await orgId(page);
}
async function typePin(page, pin = PIN) {
  for (const d of pin) await page.locator('.pinkey').filter({ hasText: new RegExp(`^${d}$`) }).click();
}
async function setPin(page) {
  await page.locator('#lockTab').click();
  await typePin(page); await typePin(page);
  await expect(page.locator('#scrim')).not.toHaveClass(/show/);
}
async function lock(page) {
  if (await page.locator('#scrim.show').count()) await page.locator('#sheet .x').click();   // a sheet covers the bar
  if (await page.locator('#lockLbl').textContent() === 'Unlocked') await page.locator('#lockTab').click();
  await expect(page.locator('#lockLbl')).toHaveText('Locked');
}
/* act() must ask for the PIN; closing the pad leaves unchanged() true; the
   right PIN runs it and done() holds. Leaves teacher mode ON. */
async function asksForPin(page, act, unchanged, done) {
  await act();
  await expect(sheetTitle(page)).toHaveText('Teacher mode');
  await page.locator('#sheet .x').click();
  await expect(page.locator('#scrim')).not.toHaveClass(/show/);
  await expect(page.locator('#lockLbl')).toHaveText('Locked');
  await unchanged();
  await act();
  await expect(sheetTitle(page)).toHaveText('Teacher mode');
  await typePin(page);
  await expect(page.locator('#lockLbl')).toHaveText('Unlocked');
  await done();
}

test('locked: attendance taps, Reports, Export CSV and hiding the tabs ask for the PIN; start a break and Return do not', async ({ page }) => {
  test.setTimeout(120000);
  await newClass(page);
  await setPin(page);
  await lock(page);

  // Before class: marking a student not here.
  await asksForPin(page, () => tileFor(page, 'Hamza T.').click(),
    () => expect(tileFor(page, 'Hamza T.')).toHaveClass(/present/),
    () => expect(tileFor(page, 'Hamza T.')).toHaveClass(/deact/));

  // Start class (the main button already asked in 4.1).
  await startClass(page);
  await expect(page.locator('#mainBtn')).toHaveText('End class');
  await lock(page);

  // After the start: marking a "Not here" student tardy.
  await asksForPin(page, () => tileFor(page, 'Hamza T.').click(),
    () => expect(tileFor(page, 'Hamza T.')).toHaveClass(/deact/),
    () => expect(tileFor(page, 'Hamza T.')).toContainText('Tardy'));
  await lock(page);

  // Start a break and Return: no PIN.
  await logBreak(page, 'Bilal R.', 'Water');
  await expect(tileFor(page, 'Bilal R.')).toHaveClass(/out/);
  await expect(page.locator('#lockLbl')).toHaveText('Locked');
  await tileFor(page, 'Bilal R.').click();
  await page.getByRole('button', { name: 'Return Bilal R.' }).click();
  await expect(tileFor(page, 'Bilal R.')).not.toHaveClass(/out/);
  await expect(page.locator('#lockLbl')).toHaveText('Locked');

  // Undo of a break the student just started stays open...
  await logBreak(page, 'Yusuf K.', 'Water');
  await expect(tileFor(page, 'Yusuf K.')).toHaveClass(/out/);
  await page.locator('#toastUndo').click();
  await expect(tileFor(page, 'Yusuf K.')).not.toHaveClass(/out/);
  await expect(page.locator('#scrim')).not.toHaveClass(/show/);

  // ...but undoing a Return (it would reopen the break) asks.
  await logBreak(page, 'Yusuf K.', 'Water');
  await tileFor(page, 'Yusuf K.').click();
  await page.getByRole('button', { name: 'Return Yusuf K.' }).click();
  await asksForPin(page, () => page.evaluate(() => undo()),
    () => expect(tileFor(page, 'Yusuf K.')).not.toHaveClass(/out/),
    () => expect(tileFor(page, 'Yusuf K.')).toHaveClass(/out/));
  await tileFor(page, 'Yusuf K.').click();
  await page.getByRole('button', { name: 'Return Yusuf K.' }).click();
  await lock(page);

  // A student's list of today's breaks (from the break sheet).
  await asksForPin(page, async () => { await tileFor(page, 'Yusuf K.').click(); await page.getByRole('button', { name: /See or fix today's breaks/ }).click(); },
    async () => {},
    () => expect(sheetTitle(page)).toHaveText("Yusuf K.'s breaks today"));
  await lock(page);

  // Bringing back a student who left for the day.
  await page.evaluate(() => { asTeacher(() => {}); });       // locked: just opens the pad
  await typePin(page);
  await tileFor(page, 'Bilal R.').click();
  await page.getByRole('button', { name: 'Bilal R. left for the day' }).click();
  await expect(tileFor(page, 'Bilal R.')).toHaveClass(/gone/);
  await lock(page);
  await asksForPin(page, () => tileFor(page, 'Bilal R.').click(),
    () => expect(tileFor(page, 'Bilal R.')).toHaveClass(/gone/),
    () => expect(tileFor(page, 'Bilal R.')).toHaveClass(/present/));
  await lock(page);

  // Reports, and locking while on Reports goes back to Log.
  await asksForPin(page, () => page.locator('.tab[data-tab="reports"]').click(),
    async () => expect(await tab(page)).toBe('log'),
    () => expect(page.locator('.app')).toHaveAttribute('data-tab', 'reports'));
  await page.locator('#lockTab').click();
  await expect(page.locator('.app')).toHaveAttribute('data-tab', 'log');

  // Export CSV (Reports' own button, reached any other way).
  let downloads = 0; page.on('download', () => { downloads++; });
  await asksForPin(page, () => page.evaluate(() => { exportCSV(); }),
    async () => { await page.waitForTimeout(300); expect(downloads).toBe(0); },
    () => expect.poll(() => downloads).toBe(1));
  await lock(page);

  // Hiding the tab bar.
  await asksForPin(page, () => page.locator('.tabhide').click(),
    () => expect(page.locator('.app')).not.toHaveClass(/tabs-hidden/),
    () => expect(page.locator('.app')).toHaveClass(/tabs-hidden/));
  await page.locator('#tabHandle').click();                    // bringing it back needs nothing
  await expect(page.locator('.app')).not.toHaveClass(/tabs-hidden/);
});

test('locked: snack/lunch from the banners, day summary, attendance today and Reset day ask for the PIN', async ({ page }) => {
  test.setTimeout(120000);
  await newClass(page);
  await startClass(page);
  await setPin(page);
  await lock(page);

  // A scheduled break that is due now shows its banner button.
  await page.evaluate(() => { window.dueBreak = () => ({ kind: 'Snack', start: '00:00', end: '23:59' }); render(); });
  const startSnack = page.locator('#banner .act', { hasText: 'Start snack' });
  await asksForPin(page, () => startSnack.click(),
    () => expect(page.locator('#mainBtn')).toHaveText('End class'),
    () => expect(sheetTitle(page)).toHaveText('Start snack for the whole class?'));
  await page.locator('#sheet .btn.dark', { hasText: 'Start snack' }).click();
  await expect(page.locator('#mainBtn')).toHaveText('End break');
  await lock(page);

  // Ending it from its banner.
  await asksForPin(page, () => page.locator('#banner .act', { hasText: 'End snack' }).click(),
    () => expect(page.locator('#mainBtn')).toHaveText('End break'),
    () => expect(page.locator('#mainBtn')).toHaveText('End class'));
  await lock(page);

  // startPause() itself, from anywhere.
  await asksForPin(page, () => page.evaluate(() => startPause('Lunch', '13:00')),
    () => expect(page.locator('#mainBtn')).toHaveText('End class'),
    () => expect(sheetTitle(page)).toHaveText('Start lunch for the whole class?'));
  await lock(page);

  // Attendance today and setStatus, from anywhere.
  await asksForPin(page, () => page.evaluate(() => openAttendanceReview()),
    async () => {},
    () => expect(sheetTitle(page)).toHaveText("Today's attendance"));
  await lock(page);
  await asksForPin(page, () => page.evaluate(() => setStatus(state.students[0].id, 'absent')),
    async () => expect(await page.evaluate(() => att(state.students[0].id).status)).toBe('present'),
    async () => expect(await page.evaluate(() => att(state.students[0].id).status)).toBe('absent'));
  await lock(page);

  // End class (with the PIN), then the "Class ended" banner's two buttons.
  await page.locator('#mainBtn').click(); await typePin(page);
  await page.locator('#sheet .btn.warn', { hasText: 'End class' }).click();
  await expect(page.locator('#banner')).toContainText('Class ended');
  await lock(page);
  await asksForPin(page, () => page.locator('#banner .act', { hasText: 'View day summary' }).click(),
    async () => {},
    () => expect(sheetTitle(page)).toHaveText('Day summary'));
  await lock(page);
  await asksForPin(page, () => page.evaluate(() => openDaySummary()),
    async () => {},
    () => expect(sheetTitle(page)).toHaveText('Day summary'));
  await lock(page);
  await asksForPin(page, () => page.locator('#banner .act', { hasText: 'Reset day' }).click(),
    () => expect(page.locator('#banner')).toContainText('Class ended'),
    () => expect(sheetTitle(page)).toHaveText('Start today over?'));
  await page.locator('#sheet .btn.warn', { hasText: 'Start the day over' }).click();
  await expect(page.locator('#mainBtn')).toHaveText('Start class');
});

test('auto-lock: locks again after the chosen minutes with no teacher action; Off never does', async ({ page }) => {
  test.setTimeout(90000);
  await newClass(page);
  await setPin(page);
  const ago = (m) => page.evaluate((m) => { teacherSeen = Date.now() - m * 60000; }, m);

  await openTab(page, 'settings');
  const choice = (label) => page.locator('#autoLockField .seg button', { hasText: new RegExp(`^${label}$`) });
  await expect(choice('5 min')).toHaveClass(/on/);                     // the default
  await openTab(page, 'log');

  await ago(4.5); await page.waitForTimeout(1500);
  await expect(page.locator('#lockLbl')).toHaveText('Unlocked');      // not yet
  await ago(5.2);
  await expect(page.locator('#lockLbl')).toHaveText('Locked', { timeout: 3000 });
  await expect(page.locator('#toastMsg')).toHaveText('Locked again');

  // Locked again while on Settings: back to Log.
  await page.locator('#lockTab').click(); await typePin(page);
  await openTab(page, 'settings');
  await choice('2 min').click();
  await expect(choice('2 min')).toHaveClass(/on/);
  await ago(2.2);
  await expect(page.locator('#lockLbl')).toHaveText('Locked', { timeout: 3000 });
  await expect(page.locator('.app')).toHaveAttribute('data-tab', 'log');

  // Off: never.
  await page.locator('#lockTab').click(); await typePin(page);
  await openTab(page, 'settings');
  await choice('Off').click();
  await ago(600); await page.waitForTimeout(2000);
  await expect(page.locator('#lockLbl')).toHaveText('Unlocked');

  // The choice is this device's, and survives a reload.
  await page.reload();
  await page.locator('.app:not(.booting)').waitFor();
  await openTab(page, 'settings');
  await expect(choice('Off')).toHaveClass(/on/);
});

test('with no PIN set nothing asks and auto-lock never fires', async ({ page }) => {
  test.setTimeout(90000);
  await newClass(page);
  await expect(page.locator('#lockLbl')).toHaveText('Unlocked');
  await tileFor(page, 'Hamza T.').click();                              // straight through, no PIN pad
  await expect(tileFor(page, 'Hamza T.')).toHaveClass(/deact/);
  await openTab(page, 'reports');
  await openTab(page, 'log');
  await startClass(page);
  await page.evaluate(() => openDaySummary());
  await expect(sheetTitle(page)).toHaveText('Day summary');
  await page.locator('#sheet .x').click();
  await page.evaluate(() => { teacherSeen = Date.now() - 3600e3; });
  await page.waitForTimeout(2000);
  await expect(page.locator('#lockLbl')).toHaveText('Unlocked');
  await expect(page.locator('#scrim')).not.toHaveClass(/show/);
});
