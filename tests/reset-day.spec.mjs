// Reset day has to really start the day over. It used to clear breaks from
// the screen only - they were still saved, came straight back from the cloud,
// and stayed in the reports, so test breaks survived a reset. It also ran on a
// single tap. See index.html resetDay().
import { test, expect } from '@playwright/test';
import {
  setupNewClass, skipTourIfPresent, joinExistingClass, orgId, tileFor,
  logBreak, returnFromBreak, startClass,
} from './helpers.mjs';

async function testedDay(browser) {
  const ctxA = await browser.newContext(); const a = await ctxA.newPage();
  await a.goto('/?emulator=1');
  await setupNewClass(a, 'Ustadh Reset', ['Amina', 'Bilal', 'Zayd']);
  await skipTourIfPresent(a);
  const code = await orgId(a);
  await startClass(a);
  await logBreak(a, 'Amina', 'Washroom');
  await returnFromBreak(a, 'Amina');
  await logBreak(a, 'Bilal', 'Water');                   // still out when the reset happens
  await tileFor(a, 'Zayd').click();
  await a.getByRole('button', { name: 'Zayd left for the day' }).click();
  const ctxB = await browser.newContext(); const b = await ctxB.newPage();
  await b.goto('/?emulator=1');
  await joinExistingClass(b, code);
  await expect.poll(() => b.evaluate(() => state.breaks.length + Object.keys(state.active).length), { timeout: 15000 }).toBe(2);
  return { a, b, close: async () => { await ctxA.close(); await ctxB.close(); } };
}
const dayOf = p => p.evaluate(() => ({
  session: state.session.status,
  breaks: state.breaks.length,
  out: Object.keys(state.active).length,
  notPresent: Object.values(state.attendance).filter(x => x.status !== 'present').length,
}));
const clean = { session: 'preclass', breaks: 0, out: 0, notPresent: 0 };

test('Reset day asks first, and keeping the day changes nothing', async ({ browser }) => {
  test.setTimeout(90000);
  const { a, close } = await testedDay(browser);
  const before = await dayOf(a);
  await a.evaluate(() => resetDay());
  await expect(a.locator('.sheet h3')).toHaveText('Start today over?');
  await expect(a.locator('.sheet p')).toContainText('2 breaks');
  await a.getByRole('button', { name: 'Keep today' }).click();
  await a.waitForTimeout(1000);
  expect(await dayOf(a)).toEqual(before);
  await close();
});

test('Reset day clears breaks and attendance everywhere, and they stay gone', async ({ browser }) => {
  test.setTimeout(90000);
  const { a, b, close } = await testedDay(browser);
  await a.evaluate(() => resetDay());
  await a.getByRole('button', { name: 'Start the day over' }).click();

  expect(await dayOf(a)).toEqual(clean);
  await expect.poll(() => dayOf(b), { timeout: 15000 }).toEqual(clean);   // the record, not just this screen
  await a.waitForTimeout(2500);                                           // every confirmation back
  expect(await dayOf(a)).toEqual(clean);                                  // nothing came back
  expect(await dayOf(b)).toEqual(clean);
  await close();
});
