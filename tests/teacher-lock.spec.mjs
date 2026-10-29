// Teacher mode (4.1): a padlock at the end of the tab bar. Once a PIN is set
// on a device, students can only start and end their own breaks; the minutes,
// fixing breaks, the teacher menu and the Reports/Roster/Settings/Profile tabs need the
// PIN. Tap the padlock + PIN to unlock, one tap to lock. The PIN is this
// device's only. See index.html teacherOn()/asTeacher()/openPin()/forgotPin().
import { test, expect } from '@playwright/test';
import {
  setupNewClass, skipTourIfPresent, orgId, openTab, tileFor, startClass, useGoogleAccount, emailOf, newEmail,
} from './helpers.mjs';

async function newClass(page) {
  await page.goto('/?emulator=1');
  await setupNewClass(page, 'Ustadh Lock', ['Amina', 'Bilal']);
  await skipTourIfPresent(page);
  return orgId(page);
}
async function typePin(page, pin) {
  for (const d of pin) await page.locator('.pinkey').filter({ hasText: new RegExp(`^${d}$`) }).click();
}
const sheetTitle = (page) => page.locator('#sheet h3');

test('no PIN means nothing is locked; setting one, locking and unlocking with the padlock', async ({ page }) => {
  test.setTimeout(90000);
  await newClass(page);
  await expect(page.locator('#lockLbl')).toHaveText('Unlocked');
  await openTab(page, 'settings');                         // no PIN yet - open as before
  await openTab(page, 'log');
  await startClass(page);

  await page.locator('#lockTab').click();
  await expect(sheetTitle(page)).toHaveText('Set a teacher PIN');
  await typePin(page, '1234');
  await expect(sheetTitle(page)).toHaveText('Type the PIN again');
  await typePin(page, '1299');
  await expect(page.locator('#pinMsg')).toContainText('did not match');
  await typePin(page, '1234');
  await typePin(page, '1234');
  await expect(page.locator('#scrim')).not.toHaveClass(/show/);
  await expect(page.locator('#lockLbl')).toHaveText('Unlocked');

  await page.locator('#lockTab').click();                  // one tap locks
  await expect(page.locator('#lockLbl')).toHaveText('Locked');

  // Settings asks for the PIN; a wrong one is refused, the right one opens it.
  await page.locator('.tab[data-tab="settings"]').click();
  await expect(sheetTitle(page)).toHaveText('Teacher mode');
  await expect(page.locator('.app')).toHaveAttribute('data-tab', 'log');
  await typePin(page, '9999');
  await expect(page.locator('#pinMsg')).toHaveText('Wrong PIN. Try again.');
  await typePin(page, '1234');
  await expect(page.locator('.app')).toHaveAttribute('data-tab', 'settings');
  await expect(page.locator('#lockLbl')).toHaveText('Unlocked');

  // Locking while on Settings goes back to Log. (Reports need the PIN too
  // since 4.3 - see teacher-lock-43.spec.mjs.)
  await page.locator('#lockTab').click();
  await expect(page.locator('.app')).toHaveAttribute('data-tab', 'log');

  // The teacher menu and the main button wait for the PIN too.
  await page.locator('.menu-btn[aria-label="Teacher menu"]').click();
  await expect(sheetTitle(page)).toHaveText('Teacher mode');
  await page.locator('#sheet .x').click();
  await expect(page.locator('#drawer')).not.toHaveClass(/show/);

  // Locked: a break starts at the usual minutes with no − / +.
  await tileFor(page, 'Amina').click();
  await page.locator('.reason', { hasText: 'Washroom' }).first().click();
  await expect(page.locator('#minDisplay')).toBeVisible();
  await expect(page.getByRole('button', { name: 'More minutes' })).toHaveCount(0);
  await page.getByRole('button', { name: "Start Amina's break" }).click();
  await expect(tileFor(page, 'Amina')).toHaveClass(/out/);

  // Locked: tapping an out student only brings them back; fixing needs the PIN.
  await tileFor(page, 'Amina').click();
  await expect(page.getByRole('button', { name: 'Return Amina' })).toBeVisible();
  await expect(page.locator('#startTime')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cancel break' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Fix the time (teacher)' }).click();
  await typePin(page, '1234');
  await expect(page.locator('#startTime')).toBeVisible();
  await page.getByRole('button', { name: 'Return Amina' }).click();
  await expect(tileFor(page, 'Amina')).not.toHaveClass(/out/);

  // Unlocked, the stepper is back.
  await tileFor(page, 'Bilal').click();
  await page.locator('.reason', { hasText: 'Water' }).first().click();
  await expect(page.getByRole('button', { name: 'More minutes' })).toBeVisible();
  await page.locator('#sheet .x').click();

  // The device remembers locked/unlocked across a reload.
  await page.locator('#lockTab').click();
  await page.reload();
  await expect(page.locator('#lockLbl')).toHaveText('Locked');
});

test('forgot the PIN: the class\'s own Google account resets it, another account does not', async ({ page }) => {
  test.setTimeout(90000);
  await newClass(page);
  const mine = emailOf(page);
  await page.locator('#lockTab').click();
  await typePin(page, '4321');
  await typePin(page, '4321');
  await page.locator('#lockTab').click();
  await expect(page.locator('#lockLbl')).toHaveText('Locked');

  await page.locator('#lockTab').click();
  await useGoogleAccount(page, newEmail('stranger'));
  await page.getByRole('button', { name: 'Forgot the PIN?' }).click();
  await expect(page.locator('#pinMsg')).toContainText('different Google account');
  await expect(page.locator('#lockLbl')).toHaveText('Locked');

  await useGoogleAccount(page, mine);
  await page.getByRole('button', { name: 'Forgot the PIN?' }).click();
  await expect(sheetTitle(page)).toHaveText('Set a teacher PIN');
  await typePin(page, '1111');
  await typePin(page, '1111');
  await page.locator('#lockTab').click();
  await page.locator('#lockTab').click();
  await typePin(page, '4321');
  await expect(page.locator('#pinMsg')).toHaveText('Wrong PIN. Try again.');
  await typePin(page, '1111');
  await expect(page.locator('#lockLbl')).toHaveText('Unlocked');
});
