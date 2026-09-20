// Shared Playwright helpers for tests/*.spec.mjs. Selectors match the real
// rendered markup in index.html - see render()/drawDrawer()/openReason().

export async function setupNewClass(page, teacherName, students) {
  await page.locator('#tName').fill(teacherName);
  for (const name of students) {
    await page.locator('#tStudent').fill(name);
    await page.locator('#tStudent').press('Enter');
  }
  await page.locator('.setup-actions button.dark').click();
}

export async function skipTourIfPresent(page) {
  const skip = page.locator('.tour.show .skip');
  if (await skip.count()) await skip.click();
}

export async function joinExistingClass(page, code) {
  await page.getByRole('link', { name: 'Enter your sync code' }).click();
  await page.locator('#joinCode2').fill(code);
  await page.getByRole('button', { name: 'Load my class' }).click();
}

export async function orgId(page) {
  return page.waitForFunction(() => window.__hifzOrgId, null, { timeout: 20000 })
    .then(() => page.evaluate(() => window.__hifzOrgId));
}

export function tileFor(page, name) {
  return page.locator('.tile', { hasText: name });
}

export async function startClass(page) {
  await page.locator('#mainBtn').click();
}

export async function logBreak(page, studentName, reasonLabel) {
  await tileFor(page, studentName).click();
  await page.locator('.reason', { hasText: reasonLabel }).first().click();
}

export async function returnFromBreak(page, studentName) {
  await tileFor(page, studentName).click();
  await page.getByRole('button', { name: `Return ${studentName}` }).click();
}

export async function openDrawer(page) {
  // idempotent: once open, the drawer's own scrim covers the header's menu
  // button, so re-clicking it (e.g. from a polling read like
  // getOtherLongMin) would hang waiting for a covered element.
  const alreadyOpen = await page.locator('#drawer.show').count();
  if (!alreadyOpen) await page.locator('.menu-btn[aria-label="Teacher menu"]').click();
}

export async function addStudentViaDrawer(page, name) {
  await openDrawer(page);
  await page.locator('#newName').fill(name);
  await page.locator('#newName').press('Enter');
  await page.locator('.dhead .menu-btn').click(); // close the drawer - it intercepts clicks on the grid behind it otherwise
}

export async function setOtherLongMin(page, minutes) {
  await openDrawer(page);
  await page.locator('.field', { hasText: 'Other' }).locator('select').selectOption(String(minutes));
}

export async function getOtherLongMin(page) {
  await openDrawer(page);
  return page.locator('.field', { hasText: 'Other' }).locator('select').inputValue();
}

export function writeCount(page) {
  return page.evaluate(() => window.__hifzWriteCount);
}

export function resetWriteCount(page) {
  return page.evaluate(() => { window.__hifzWriteCount = 0; });
}

// ---- Phase 3: migration test helpers ----

// day id N days before "now" in the page's own clock/timezone, computed via
// the app's own dayId() so it's guaranteed to match what the app itself
// would call that date.
export function dayIdBack(page, n) {
  return page.evaluate((n) => dayId(new Date(Date.now() - n * 86400000)), n);
}

export function seedFirestoreDay(page, id, attendance, breaksArr) {
  return page.evaluate(
    ([id, attendance, breaksArr]) => window.__hifzTestSeedDay(id, attendance, breaksArr),
    [id, attendance, breaksArr]
  );
}

export function readFirestoreDay(page, id) {
  return page.evaluate((id) => window.__hifzTestReadDay(id), id);
}

export async function waitForMigration(page) {
  await page.waitForFunction(() => window.__hifzMigrationDone === true, null, { timeout: 20000 });
}

// Injects legacy localStorage history (as if this device had been running
// the tracker before it ever synced) before the app's own boot script runs,
// so migrateLegacyHistoryIfNeeded() finds it on first load.
export function seedLegacyLocalHistory(context, historyMap) {
  return context.addInitScript((history) => {
    localStorage.setItem('hifz.tracker.history', JSON.stringify(history));
  }, historyMap);
}

export async function openDayReport(page, offsetBack) {
  await openDrawer(page);
  await page.locator('.dbtn', { hasText: 'Reports' }).click();
  await page.locator('.rnav').waitFor();
  for (let i = 0; i < offsetBack; i++) {
    await page.locator('.rnav button').first().click();
    await page.locator('.rnav').waitFor();
  }
}
