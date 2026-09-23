// Quick successive changes must leave the screen matching the record.
// Each listener skipped answers that still carried this device's unconfirmed
// changes, and by default heard nothing when those were confirmed. So an
// answer the cloud computed for change 1, delivered just after change 2 was
// made on screen, carried no pending flag (change 2 wasn't in it) and was
// applied: change 2 vanished from the screen - saved in the record, but
// shown wrong until some other change came along. includeMetadataChanges on
// the listeners delivers the confirmation of change 2, which corrects it.
import { test, expect } from '@playwright/test';
import { setupNewClass, skipTourIfPresent, orgId, startClass, tileFor } from './helpers.mjs';

test('rapid attendance changes end with the screen matching the record', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/?emulator=1');
  await setupNewClass(page, 'Ustadh Rapid', ['Amina', 'Bilal', 'Zayd']);
  await skipTourIfPresent(page);
  await orgId(page);
  await startClass(page);
  await page.waitForTimeout(800);

  // left, back, left, back... as fast as the cloud's answers come in, across three students
  for (let round = 0; round < 12; round++) {
    await page.evaluate(async (r) => {
      const ids = state.students.map(s => s.id);
      for (const id of ids) {
        const a = state.attendance[id];
        if (a.status === 'left') tap(id); else markLeft(id);
        await new Promise(res => setTimeout(res, 5 + (r * 7) % 40));   // varied spacing to hit the window
      }
    }, round);
  }
  await page.waitForTimeout(2500);                       // everything confirmed

  const screen = await page.evaluate(() => Object.fromEntries(state.students.map(s => [s.name, state.attendance[s.id].status])));
  const record = await page.evaluate(async () => {
    const snap = await dayRef().get({ source: 'server' });
    const att = snap.data().attendance;
    return Object.fromEntries(state.students.map(s => [s.name, att[s.id].status]));
  });
  expect(screen).toEqual(record);
  for (const name of ['Amina', 'Bilal', 'Zayd']) {
    const tile = tileFor(page, name);
    if (screen[name] === 'left') await expect(tile).toHaveClass(/gone/); else await expect(tile).toHaveClass(/present/);
  }
});
