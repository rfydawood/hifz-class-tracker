// Teacher mode, 4.3: the loopholes closed. With a PIN set and the tablet
// locked, students keep exactly two things - start a break, and Return.
// Everything else asks for the PIN: does nothing if the PIN pad is closed,
// and goes ahead once the right PIN is typed. Plus auto-lock ("Lock again
// automatically", Off / 2 / 5 / 10 minutes). See index.html asTeacher(),
// LOCKED_TABS, autoLockCheck(). Made-up names only.
import { test, expect } from '@playwright/test';
import { setupNewClass, skipTourIfPresent, orgId, openTab, tileFor, startClass, logBreak, returnFromBreak, openDrawer } from './helpers.mjs';

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

// ----- 4.3 review: the remaining ways in, and what does and doesn't count as a teacher action -----

// Locks the tablet where it stands (the ☰ menu or Settings stay open), as if
// the lock came while the teacher was there - so the buttons inside can be
// tried locked.
const lockInPlace = (page) => page.evaluate(() => { Store.set('teacher.unlocked', '0'); paintLock(); });
const ago = (page, m) => page.evaluate((m) => { teacherSeen = Date.now() - m * 60000; }, m);
const idleMin = (page) => page.evaluate(() => (Date.now() - teacherSeen) / 60000);
const drawerBtn = (page, t) => page.locator('#drawer .dbtn', { hasText: t }).first();
// A ☰ menu button pressed while locked; the menu is then put away so the PIN
// pad (which a real lock never shows under the menu - locking closes it) can be used.
const pressInMenu = (page, t) => async () => { await drawerBtn(page, t).dispatchEvent('click'); await page.evaluate(() => closeDrawer()); };
const sessionStatus = (page) => page.evaluate(() => state.session.status);

test('locked: undo of attendance, the ☰ menu\'s class buttons, Settings\' Reset day and the break editors called directly ask for the PIN', async ({ page }) => {
  test.setTimeout(150000);
  await newClass(page);
  await setPin(page);

  // undo() of an attendance change.
  await tileFor(page, 'Hamza T.').click();
  await expect(tileFor(page, 'Hamza T.')).toHaveClass(/deact/);
  await lock(page);
  await asksForPin(page, () => page.evaluate(() => undo()),
    () => expect(tileFor(page, 'Hamza T.')).toHaveClass(/deact/),
    () => expect(tileFor(page, 'Hamza T.')).not.toHaveClass(/deact/));

  // Start class from the menu.
  await openDrawer(page); await lockInPlace(page);
  await asksForPin(page, pressInMenu(page, 'Start class'),
    async () => expect(await sessionStatus(page)).toBe('preclass'),
    () => expect(page.locator('#mainBtn')).toHaveText('End class'));

  // A scheduled break from the menu (startScheduledBreak).
  await openDrawer(page); await lockInPlace(page);
  await asksForPin(page, pressInMenu(page, 'Start snack'),
    async () => expect(await sessionStatus(page)).toBe('live'),
    () => expect(sheetTitle(page)).toHaveText('Start snack for the whole class?'));
  await page.locator('#sheet .x').click();
  await page.evaluate(() => closeDrawer());

  // End class from the menu.
  await openDrawer(page); await lockInPlace(page);
  await asksForPin(page, pressInMenu(page, 'End class'),
    async () => expect(await sessionStatus(page)).toBe('live'),
    () => expect(sheetTitle(page)).toHaveText('End class for today?'));
  await page.locator('#sheet .btn.warn', { hasText: 'End class' }).click();
  await expect(page.locator('#banner')).toContainText('Class ended');

  // Resume class, from the menu and called directly.
  await openDrawer(page); await lockInPlace(page);
  await asksForPin(page, pressInMenu(page, 'Resume class'),
    async () => expect(await sessionStatus(page)).toBe('ended'),
    () => expect.poll(() => sessionStatus(page)).toBe('live'));
  await page.evaluate(() => closeDrawer());
  await page.locator('#mainBtn').click();
  await page.locator('#sheet .btn.warn', { hasText: 'End class' }).click();
  await lock(page);
  await asksForPin(page, () => page.evaluate(() => resumeClass()),
    async () => expect(await sessionStatus(page)).toBe('ended'),
    () => expect.poll(() => sessionStatus(page)).toBe('live'));

  // Reset the day, from Settings.
  await openTab(page, 'settings'); await lockInPlace(page);
  await asksForPin(page, () => page.locator('#viewSettings .dbtn', { hasText: 'Reset the day' }).click(),
    async () => expect(await sessionStatus(page)).toBe('live'),
    () => expect(sheetTitle(page)).toHaveText('Start today over?'));
  await page.locator('#sheet .x').click();
  await openTab(page, 'log');

  // The break editors' saves and delete, called directly.
  await logBreak(page, 'Bilal R.', 'Water');
  await returnFromBreak(page, 'Bilal R.');
  await logBreak(page, 'Yusuf K.', 'Water');
  const ids = await page.evaluate(() => { const b = state.breaks[0]; return { sid: b.sid, id: b._id || breakDocId(b.sid, b.startAt), out: Object.keys(state.active)[0] }; });
  await lock(page);
  await asksForPin(page, () => page.evaluate((o) => saveBreakEdits(o.out), ids),
    () => expect(tileFor(page, 'Yusuf K.')).toHaveClass(/out/),
    () => expect(page.locator('#toastMsg')).toHaveText('Please set both times.'));          // ran: no editor open
  await expect(tileFor(page, 'Yusuf K.')).toHaveClass(/out/);
  await lock(page);
  await asksForPin(page, () => page.evaluate((o) => saveLoggedBreak(o.sid, o.id), ids),
    async () => expect(await page.evaluate(() => state.breaks.length)).toBe(1),
    () => expect(page.locator('#toastMsg')).toHaveText('Please set both times.'));
  await lock(page);
  await asksForPin(page, () => page.evaluate((o) => deleteLoggedBreak(o.sid, o.id), ids),
    async () => expect(await page.evaluate(() => state.breaks.length)).toBe(1),
    () => expect(sheetTitle(page)).toContainText("Delete Bilal R.'s water break"));
  await page.locator('#sheet .btn.warn', { hasText: 'Delete break' }).click();
  await expect.poll(() => page.evaluate(() => state.breaks.length)).toBe(0);
});

test('auto-lock: 10 min; taps in Settings and Reports restart it; locking on Reports goes to Log; a student\'s Return does not restart it', async ({ page }) => {
  test.setTimeout(120000);
  await newClass(page);
  await setPin(page);
  const choice = (label) => page.locator('#autoLockField .seg button', { hasText: new RegExp(`^${label}$`) });

  // 10 minutes.
  await openTab(page, 'settings');
  await choice('10 min').click();
  await expect(choice('10 min')).toHaveClass(/on/);
  await openTab(page, 'log');
  await ago(page, 9.5); await page.waitForTimeout(1500);
  await expect(page.locator('#lockLbl')).toHaveText('Unlocked');
  await ago(page, 10.2);
  await expect(page.locator('#lockLbl')).toHaveText('Locked', { timeout: 3000 });
  await page.locator('#lockTab').click(); await typePin(page);
  await openTab(page, 'settings');
  await choice('5 min').click();

  // A tap in Settings restarts the countdown.
  await ago(page, 4.8);
  await page.locator('#viewSettings h4', { hasText: 'Teacher mode' }).click();
  expect(await idleMin(page)).toBeLessThan(0.2);

  // So does a tap in Reports; and locking there goes back to Log.
  await openTab(page, 'reports');
  await ago(page, 4.8);
  await page.locator('#viewReports').click({ position: { x: 5, y: 5 } });
  expect(await idleMin(page)).toBeLessThan(0.2);
  await ago(page, 5.2);
  await expect(page.locator('#lockLbl')).toHaveText('Locked', { timeout: 3000 });
  await expect(page.locator('.app')).toHaveAttribute('data-tab', 'log');

  // Unlocked, a student starting a break and coming back with the times
  // untouched is not a teacher action...
  await page.locator('#lockTab').click(); await typePin(page);
  await startClass(page);
  await ago(page, 3);
  await logBreak(page, 'Bilal R.', 'Water');
  await tileFor(page, 'Bilal R.').click();
  await expect(page.locator('#startTime')).toBeVisible();             // unlocked: the full editor
  await page.locator('#sheet h3').click();                             // a tap in a student's sheet
  await page.getByRole('button', { name: 'Return Bilal R.' }).click();
  await expect(tileFor(page, 'Bilal R.')).not.toHaveClass(/out/);
  expect(await idleMin(page)).toBeGreaterThan(2.9);
  await ago(page, 5.2);
  await expect(page.locator('#lockLbl')).toHaveText('Locked', { timeout: 3000 });

  // ...but correcting the times is.
  await page.locator('#lockTab').click(); await typePin(page);
  await logBreak(page, 'Hamza T.', 'Water');
  await page.evaluate(async () => {
    const id = Object.values(state.active)[0]._id;
    await dayRef().collection('breaks').doc(id).update({ startAt: Date.now() - 10 * 60000 });
  });
  await expect.poll(() => page.evaluate(() => Math.round((Date.now() - Object.values(state.active)[0].startAt) / 60000)), { timeout: 15000 }).toBe(10);
  await ago(page, 3);
  await tileFor(page, 'Hamza T.').click();
  const t = new Date(Date.now() - 2 * 60000);
  await page.locator('#endTime').fill(`${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`);
  await ago(page, 3);                                                  // the typing above was in a student's sheet
  await page.getByRole('button', { name: 'Return Hamza T.' }).click();
  await expect(tileFor(page, 'Hamza T.')).not.toHaveClass(/out/);
  expect(await idleMin(page)).toBeLessThan(0.2);
});

test('auto-lock: a fresh open starts locked (unless Off); Add a class closes on lock and needs the PIN; teacher sheets count, a student\'s does not', async ({ page }) => {
  test.setTimeout(150000);
  await newClass(page);
  await setPin(page);
  await expect(page.locator('#lockLbl')).toHaveText('Unlocked');

  // Closing and reopening the app: locked, the PIN once.
  await page.reload();
  await page.locator('.app:not(.booting)').waitFor();
  await expect(page.locator('#lockLbl')).toHaveText('Locked');
  await page.locator('#lockTab').click(); await typePin(page);

  // Add a class: taps inside count, locking closes it.
  await openTab(page, 'profile');
  await page.locator('.addcls').click();
  await expect(page.locator('#addClass')).toHaveClass(/show/);
  await ago(page, 4.8);
  await page.locator('#acName').fill('Period 5');
  expect(await idleMin(page)).toBeLessThan(0.2);
  await ago(page, 5.2);
  await expect(page.locator('#lockLbl')).toHaveText('Locked', { timeout: 3000 });
  await expect(page.locator('#addClass')).not.toHaveClass(/show/);
  await expect(page.locator('.app')).toHaveAttribute('data-tab', 'log');

  // acCreate() itself needs the PIN.
  await page.locator('#lockTab').click(); await typePin(page);
  await openTab(page, 'profile');
  await page.locator('.addcls').click();
  await page.locator('#acName').fill('Period 5');
  const classes = () => page.evaluate(() => (state.classes || []).length);
  const before = await classes();
  await lockInPlace(page);
  await page.evaluate(() => acCreate());
  await expect(sheetTitle(page)).toHaveText('Teacher mode');
  await page.waitForTimeout(300);
  expect(await classes()).toBe(before);
  await page.evaluate(async (pin) => { for (const d of pin) await pinKey(d); }, PIN);      // the pad sits under the wizard here
  await expect.poll(classes).toBe(before + 1);
  await expect(page.locator('#addClass')).not.toHaveClass(/show/);
  await openTab(page, 'log');

  // A teacher editing the schedule (a sheet opened from Settings) is not locked mid-edit.
  await openTab(page, 'settings');
  await page.locator('#viewSettings .srow.usual .sedit').click();
  await expect(sheetTitle(page)).toHaveText('Usual day');
  await expect(page.locator('#sheet')).toHaveAttribute('data-teacher', '1');
  await ago(page, 4.8);
  await page.locator('#sheet input[aria-label="Class ends"]').fill('15:45');
  expect(await idleMin(page)).toBeLessThan(0.2);
  await page.waitForTimeout(1500);
  await expect(page.locator('#lockLbl')).toHaveText('Unlocked');
  await expect(sheetTitle(page)).toHaveText('Usual day');
  await page.locator('#sheet .x').click();
  await openTab(page, 'log');

  // The Day summary, opened from the menu, counts too.
  await openDrawer(page);
  await drawerBtn(page, 'Day summary').click();
  await expect(sheetTitle(page)).toHaveText('Day summary');
  await expect(page.locator('#sheet')).toHaveAttribute('data-teacher', '1');
  await ago(page, 4.8);
  await page.locator('#sheet h3').click();
  expect(await idleMin(page)).toBeLessThan(0.2);
  await page.locator('#sheet .x').click();

  // A student's own break sheet does not.
  await startClass(page);
  await tileFor(page, 'Yusuf K.').click();
  await expect(sheetTitle(page)).toHaveText('Where is Yusuf K. going?');
  await expect(page.locator('#sheet')).not.toHaveAttribute('data-teacher', '1');
  await ago(page, 4.8);
  await page.locator('#rnote').click();
  expect(await idleMin(page)).toBeGreaterThan(4.7);
  await ago(page, 5.2);
  await expect(page.locator('#lockLbl')).toHaveText('Locked', { timeout: 3000 });
  await expect(page.locator('#scrim')).not.toHaveClass(/show/);

  // With auto-lock Off, the teacher chose to stay unlocked: a reload keeps it.
  await page.locator('#lockTab').click(); await typePin(page);
  await openTab(page, 'settings');
  await page.locator('#autoLockField .seg button', { hasText: /^Off$/ }).click();
  await page.reload();
  await page.locator('.app:not(.booting)').waitFor();
  await expect(page.locator('#lockLbl')).toHaveText('Unlocked');
});

test('forgetting the account here also clears the auto-lock choice, Appearance and the background photo', async ({ page }) => {
  await page.goto('/?emulator=1');
  await page.waitForFunction(() => typeof Store !== 'undefined' && typeof forgetAccountHere === 'function');
  const keys = ['teacher.pin', 'teacher.unlocked', 'teacher.autoLock', 'ui.appearance', 'ui.bgPhoto'];
  const left = await page.evaluate(async (keys) => {
    let cleared = 0;
    window.clearBgPhoto = async () => { cleared++; };                     // the photo's own store (IndexedDB)
    keys.forEach((k) => Store.set(k, k === 'ui.appearance' ? '{"theme":"plum"}' : 'x'));
    await forgetAccountHere([]);
    return { cleared, store: keys.filter((k) => Store.get(k) != null), local: keys.filter((k) => localStorage.getItem(k) != null) };
  }, keys);
  expect(left).toEqual({ cleared: 1, store: [], local: [] });
});
