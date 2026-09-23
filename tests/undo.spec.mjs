// Undo used to change only the screen. A mis-tapped break, undone, stayed
// open in the cloud: the record kept it, and the next sync brought the student
// back "out" with a timer running. Same for an undone return and an undone
// attendance change. See index.html undo().
import { test, expect } from '@playwright/test';
import {
  setupNewClass, skipTourIfPresent, joinExistingClass, orgId, tileFor,
  logBreak, returnFromBreak, startClass,
} from './helpers.mjs';

async function twoDevices(browser, students) {
  const ctxA = await browser.newContext(); const a = await ctxA.newPage();
  await a.goto('/?emulator=1');
  await setupNewClass(a, 'Ustadh Undo', students);
  await skipTourIfPresent(a);
  const code = await orgId(a);
  await startClass(a);
  const ctxB = await browser.newContext(); const b = await ctxB.newPage();
  await b.goto('/?emulator=1');
  await joinExistingClass(b, code);
  await expect.poll(() => b.evaluate(() => state.session.status), { timeout: 15000 }).toBe('live');
  return { a, b, close: async () => { await ctxA.close(); await ctxB.close(); } };
}

test('undoing a mistaken break removes it everywhere, and it stays gone', async ({ browser }) => {
  test.setTimeout(90000);
  const { a, b, close } = await twoDevices(browser, ['Amina', 'Bilal']);

  await logBreak(a, 'Amina', 'Water');
  await expect(tileFor(b, 'Amina')).toHaveClass(/out/, { timeout: 15000 });   // it reached the cloud
  await a.locator('#toastUndo').click();
  await expect(tileFor(a, 'Amina')).not.toHaveClass(/out/);

  // the other device - and so the record - loses it too
  await expect(tileFor(b, 'Amina')).not.toHaveClass(/out/, { timeout: 15000 });

  // an unrelated change syncs; the undone break must not come back
  await logBreak(a, 'Bilal', 'Washroom');
  await expect(tileFor(b, 'Bilal')).toHaveClass(/out/, { timeout: 15000 });
  await a.waitForTimeout(1500);
  await expect(tileFor(a, 'Amina')).not.toHaveClass(/out/);
  await expect(tileFor(b, 'Amina')).not.toHaveClass(/out/);
  await close();
});

test('undoing a return puts the student back out everywhere', async ({ browser }) => {
  test.setTimeout(90000);
  const { a, b, close } = await twoDevices(browser, ['Amina', 'Bilal']);

  await logBreak(a, 'Amina', 'Washroom');
  await returnFromBreak(a, 'Amina');
  await expect.poll(() => b.evaluate(() => state.breaks.length), { timeout: 15000 }).toBe(1);
  await a.locator('#toastUndo').click();
  await expect(tileFor(a, 'Amina')).toHaveClass(/out/);
  await expect(tileFor(b, 'Amina')).toHaveClass(/out/, { timeout: 15000 });
  await expect.poll(() => b.evaluate(() => state.breaks.length), { timeout: 15000 }).toBe(0);
  await close();
});

test('undoing an attendance change reaches the record', async ({ browser }) => {
  test.setTimeout(90000);
  const { a, b, close } = await twoDevices(browser, ['Amina', 'Bilal']);

  await tileFor(a, 'Amina').click();
  await a.getByRole('button', { name: 'Amina left for the day' }).click();
  await expect.poll(() => b.evaluate(() => state.attendance[state.students[0].id].status), { timeout: 15000 }).toBe('left');
  await a.locator('#toastUndo').click();
  await expect.poll(() => b.evaluate(() => state.attendance[state.students[0].id].status), { timeout: 15000 }).toBe('present');
  await close();
});
