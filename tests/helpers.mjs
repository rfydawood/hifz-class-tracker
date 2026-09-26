// Shared Playwright helpers for tests/*.spec.mjs. Selectors match the real
// rendered markup in index.html - see render()/drawDrawer()/openReason().

// Every class belongs to a Google account since Phase 4 Part A. The Auth
// emulator accepts an unsigned Google token, which the app picks up from
// window.__hifzTestGoogle (emulator mode only - see googleCredential()).
const emailByPage = new WeakMap();
const emailByOrg = new Map();
let accounts = 0;
export function newEmail(prefix = 'teacher') {
  return `${prefix}-${Date.now().toString(36)}-${++accounts}@example.com`;
}
export function googleToken(email) {
  return { sub: 'g-' + email, email, email_verified: true, name: email.split('@')[0] };
}
export async function useGoogleAccount(page, email) {
  emailByPage.set(page, email);
  await page.evaluate((t) => { window.__hifzTestGoogle = t; }, googleToken(email));
}
export async function signInOnGate(page, email) {
  await page.locator('#signin.show').waitFor({ timeout: 20000 });
  await useGoogleAccount(page, email);
  await page.locator('#signinBtn').click();
}
export function emailOf(page) { return emailByPage.get(page); }

export async function setupNewClass(page, teacherName, students, email = newEmail()) {
  await signInOnGate(page, email);
  await page.locator('#setup.show').waitFor({ timeout: 20000 });
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

// A second device opens the same class by signing in with the same account.
export async function joinExistingClass(page, code) {
  const email = emailByOrg.get(code);
  if (!email) throw new Error(`no account recorded for class ${code} - call orgId() on the first device`);
  await signInOnGate(page, email);
  await page.waitForFunction((c) => window.__hifzOrgId === c, code, { timeout: 20000 });
}

export async function orgId(page) {
  await page.waitForFunction(() => window.__hifzOrgId, null, { timeout: 20000 });
  const code = await page.evaluate(() => window.__hifzOrgId);
  if (emailByPage.get(page)) emailByOrg.set(code, emailByPage.get(page));
  return code;
}

export function tileFor(page, name) {
  return page.locator('.tile', { hasText: name });
}

export async function startClass(page) {
  await page.locator('#mainBtn').click();
}

// Every break type opens the minutes stepper (3.6); Start takes its default.
export async function logBreak(page, studentName, reasonLabel, minutes) {
  await tileFor(page, studentName).click();
  await page.locator('.reason', { hasText: reasonLabel }).first().click();
  if (minutes != null) {
    for (let i = 0; i < 12; i++) {
      const now = +(await page.locator('#minDisplay').textContent());
      if (now === minutes) break;
      await page.getByRole('button', { name: now < minutes ? 'More minutes' : 'Fewer minutes' }).click();
    }
  }
  await page.getByRole('button', { name: `Start ${studentName}'s break` }).click();
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

export async function setWashroomLimit(page, minutes) {
  await openDrawer(page);
  await page.locator('.field', { hasText: 'Washroom' }).locator('select').first().selectOption(String(minutes));
}

export async function getWashroomLimit(page) {
  await openDrawer(page);
  return page.locator('.field', { hasText: 'Washroom' }).locator('select').first().inputValue();
}

export function writeCount(page) {
  return page.evaluate(() => window.__hifzWriteCount);
}

export function resetWriteCount(page) {
  return page.evaluate(() => { window.__hifzWriteCount = 0; });
}

// Simulates a native Android device whose Capacitor Preferences store is
// empty (e.g. nothing has ever been written there for legacy keys), so
// Store.hydrate()'s native path is exercised - it must fall back to
// localStorage instead of silently treating an empty Preferences read as
// "there is no data" (the bug: pre-Phase-1 native builds wrote straight to
// localStorage, before the Preferences plugin was ever wired up).
export function mockNativePlatform(context, { googleEmail } = {}) {
  return context.addInitScript((token) => {
    window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        ...(token ? { FirebaseAuthentication: {
          calls: 0,
          async signInWithGoogle() { this.calls++; return { user: null, credential: { idToken: JSON.stringify(token) } }; },
        } } : {}),
        Preferences: {
          _store: {},
          async get({ key }) { return { value: Object.prototype.hasOwnProperty.call(this._store, key) ? this._store[key] : null }; },
          async set({ key, value }) { this._store[key] = value; },
          async remove({ key }) { delete this._store[key]; },
        },
      },
    };
  }, googleEmail ? googleToken(googleEmail) : null);
}

export function readMockPreference(page, key) {
  return page.evaluate((key) => window.Capacitor.Plugins.Preferences._store[key] ?? null, key);
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

// ---- Phase 4 Part A: a class made the way every install before 3.7 made it -
// an anonymous user, member of its own org - to test linking it to Google.
export async function createAnonymousClass(page, teacher, students) {
  await page.locator('#signin.show').waitFor({ timeout: 20000 });
  const code = await page.evaluate(async ([teacher, students]) => {
    await initFirestore();
    const r = await firebase.auth(fbApp).signInAnonymously(); setUser(r.user);
    const code = genSyncCode(), now = firebase.firestore.FieldValue.serverTimestamp(), today = dayId(new Date());
    const org = orgRefFor(code), cls = org.collection('classes').doc('default'), b = fbDb.batch();
    b.set(org, { schemaVersion: 3, name: `${teacher}'s Hifz Class`, kind: 'personal', activeYearId: academicYearId(new Date()),
      defaults: settingsToDefaults(state.settings), createdAt: now, updatedAt: now });
    b.set(org.collection('members').doc(fbUid), { email: '', displayName: teacher, roles: ['admin', 'teacher'], status: 'active', joinedAt: now });
    b.set(cls, { name: `${teacher}'s Hifz Class`, teacherUid: fbUid, settingsOverride: null, status: 'active' });
    students.forEach((n, i) => b.set(cls.collection('students').doc('s' + i), { name: n, active: true, order: i, enrolledFrom: today, enrolledUntil: null }));
    await b.commit();
    // straight into localStorage too: the native mock's Preferences don't
    // survive the reload below, and Store.hydrate() falls back to localStorage
    const keep = { 'session.orgId': code, 'session.classId': 'default',
      'hifz.guest.profile': JSON.stringify({ teacher, setup: true, students: students.map((n, i) => ({ id: 's' + i, name: n, active: true })) }) };
    for (const [k, v] of Object.entries(keep)) { Store.set(k, v); localStorage.setItem(k, v); }
    return code;
  }, [teacher, students]);
  await page.reload();
  await page.waitForFunction((c) => window.__hifzOrgId === c && window.__hifzSyncStatus === 'synced', code, { timeout: 20000 });
  return code;
}

// Reads straight from the emulator as the signed-in user of `page`.
export function readAs(page, path) {
  return page.evaluate(async (path) => {
    const s = await fbDb.doc(path).get();
    return s.exists ? s.data() : null;
  }, path);
}
export function currentUid(page) {
  return page.evaluate(() => fbUid);
}
