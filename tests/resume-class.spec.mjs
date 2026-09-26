// Ending class and tapping the main button again used to start a new class,
// replacing the day's real start time - the owner lost a day's start time this
// way on Sep 23. An ended class that started today is resumed instead: same
// start time, attendance left alone. See index.html canResume()/resumeClass().
import { test, expect } from '@playwright/test';
import {
  setupNewClass, skipTourIfPresent, joinExistingClass, orgId, tileFor, startClass,
} from './helpers.mjs';

const sessionOf = p => p.evaluate(() => ({
  status: state.session.status,
  startedAt: state.session.startedAt ? +state.session.startedAt : null,
  endedAt: state.session.endedAt ? +state.session.endedAt : null,
}));

test('Resume class keeps the start time, on reload and on a second device', async ({ browser }) => {
  test.setTimeout(90000);
  const ctxA = await browser.newContext(); const a = await ctxA.newPage();
  await a.goto('/?emulator=1');
  await setupNewClass(a, 'Ustadh Resume', ['Amina', 'Bilal']);
  await skipTourIfPresent(a);
  const code = await orgId(a);

  await tileFor(a, 'Bilal').click();                         // not here before class
  await startClass(a);
  const started = (await sessionOf(a)).startedAt;
  expect(started).toBeTruthy();

  await a.waitForTimeout(1200);                              // so a new start time would differ
  await a.evaluate(() => endClass());
  await a.getByRole('button', { name: 'End class' }).last().click();
  await expect(a.locator('#mainBtn')).toHaveText('Resume class');

  await a.locator('#mainBtn').click();
  await expect(a.locator('#toastMsg')).toContainText('Class resumed at');
  expect(await sessionOf(a)).toEqual({ status: 'live', startedAt: started, endedAt: null });
  expect(await a.evaluate(() => state.attendance.s1.status)).toBe('absent');   // attendance left alone
  expect(await a.evaluate(() => state.log[0].msg)).toBe('Class resumed');

  const ctxB = await browser.newContext(); const b = await ctxB.newPage();
  await b.goto('/?emulator=1');
  await joinExistingClass(b, code);
  await expect.poll(() => sessionOf(b), { timeout: 15000 }).toEqual({ status: 'live', startedAt: started, endedAt: null });

  await a.waitForTimeout(1500);                              // confirmation back from the cloud
  await a.reload();
  await expect.poll(() => sessionOf(a), { timeout: 15000 }).toEqual({ status: 'live', startedAt: started, endedAt: null });
  await ctxA.close(); await ctxB.close();
});
