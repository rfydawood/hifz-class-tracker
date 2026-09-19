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
  await page.locator('.menu-btn[aria-label="Teacher menu"]').click();
}

export async function addStudentViaDrawer(page, name) {
  await openDrawer(page);
  await page.locator('#newName').fill(name);
  await page.locator('#newName').press('Enter');
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
