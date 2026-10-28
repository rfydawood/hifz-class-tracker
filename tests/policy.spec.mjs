// 4.2: the Terms of use and Privacy policy screen (index.html ensurePolicy()).
// Every account accepts the current POLICY_VERSION once: a new account right
// after signing in, an existing one when the version is raised (with "What's
// changed"). Acceptance is on users/{uid}.policy, and the device keeps its own
// note so an offline boot isn't blocked.
import { test, expect } from '@playwright/test';
import {
  newEmail, signInOnGate, setupNewClass, skipTourIfPresent, orgId, tileFor, readAs, currentUid,
  acceptPolicyIfAsked, startClass, logBreak, createAnonymousClass,
} from './helpers.mjs';

const TERMS = 'https://rfydawood.github.io/breaklog/terms.html';
const PRIVACY = 'https://rfydawood.github.io/breaklog/privacy.html';
const SHOTS = process.env.POLICY_SHOTS;                     // folder for screenshots of the screen, when set

// No connection to the cloud: the emulators can't be reached and the browser
// says it is offline. (context.setOffline would also stop the page itself
// loading from the test server.)
const EMULATORS = /127\.0\.0\.1:(8080|9099)/;
async function goOffline(ctx) {
  await ctx.route(EMULATORS, (r) => r.abort('internetdisconnected'));
  await ctx.addInitScript(() => {
    window.__testOffline = true;
    Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => !window.__testOffline });
  });
}

async function shoot(page, name) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

test('a new account must accept the terms before setting up, and the acceptance is saved on the account', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/?emulator=1');
  const email = newEmail('policy');
  await signInOnGate(page, email, { acceptPolicy: false });
  const gate = page.locator('#policy.show');
  await expect(gate).toBeVisible({ timeout: 20000 });
  await expect(gate).toContainText("Before you start, please read and accept BreakLog's Terms of use and Privacy policy.");
  await expect(page.locator('#policyChanges')).toBeHidden();                  // nothing has changed for a new account
  await expect(gate.getByRole('link', { name: 'Terms of use' })).toHaveAttribute('href', TERMS);
  await expect(gate.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', PRIVACY);
  await expect(gate.getByRole('link', { name: 'Terms of use' })).toHaveAttribute('target', '_blank');
  await expect(page.locator('#setup.show')).toHaveCount(0);                   // the class setup waits
  await expect(page.locator('#policyAccept')).toBeDisabled();
  await page.locator('#policyAccept').click({ force: true });                 // a tap on the greyed-out button does nothing
  await expect(gate).toBeVisible();
  expect(await page.evaluate(() => window.__hifzPolicy)).toBe('asking');

  await page.locator('#policy .ptoggle').click();
  await expect(page.locator('#policyOk')).toBeChecked();
  await expect(page.locator('#policyAccept')).toBeEnabled();
  await page.locator('#policy .ptoggle').click();                             // and off again
  await expect(page.locator('#policyAccept')).toBeDisabled();
  await page.locator('#policy .ptoggle').click();
  await page.locator('#policyAccept').click();
  await expect(gate).toHaveCount(0);
  await expect(page.locator('#setup.show')).toBeVisible({ timeout: 20000 });

  const uid = await currentUid(page);
  await expect.poll(async () => (await readAs(page, `users/${uid}`))?.policy?.version, { timeout: 15000 }).toBe('2026-10-27');
  // the server's own time, once it has the write
  await expect.poll(() => page.evaluate(async (uid) => {
    const s = await fbDb.collection('users').doc(uid).get({ source: 'server' });
    return typeof s.data()?.policy?.acceptedAt?.toMillis;
  }, uid), { timeout: 15000 }).toBe('function');
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('policy.accepted')))).toEqual({ [uid]: '2026-10-27' });

  // the class is made as usual, users/{uid} gets its orgIds next to the policy
  await page.locator('#tName').fill('Ustadh Policy');
  await page.locator('#tStudent').fill('Student A');
  await page.locator('#tStudent').press('Enter');
  await page.locator('.setup-actions button.dark').click();
  await skipTourIfPresent(page);
  const code = await orgId(page);
  await expect.poll(async () => (await readAs(page, `users/${uid}`))?.orgIds, { timeout: 15000 }).toEqual([code]);
  expect((await readAs(page, `users/${uid}`)).policy.version).toBe('2026-10-27');

  // not asked again after a reload
  await page.reload();
  await page.waitForFunction((c) => window.__hifzOrgId === c && window.__hifzSyncStatus === 'synced', code, { timeout: 20000 });
  expect(await page.evaluate(() => window.__hifzPolicy)).toBe('ok');
  await expect(page.locator('#policy.show')).toHaveCount(0);
  await expect(tileFor(page, 'Student A')).toBeVisible();
});

test('an account that already accepted is not asked on another device', async ({ browser }) => {
  test.setTimeout(60000);
  const ctxA = await browser.newContext(); const a = await ctxA.newPage();
  await a.goto('/?emulator=1');
  const email = newEmail('accepted');
  await setupNewClass(a, 'Ustadh Accepted', ['Student A'], email);            // accepts on the way in
  await skipTourIfPresent(a);
  const code = await orgId(a);
  await expect.poll(async () => (await readAs(a, `users/${await currentUid(a)}`))?.policy?.version, { timeout: 15000 }).toBe('2026-10-27');
  await ctxA.close();

  const ctxB = await browser.newContext(); const b = await ctxB.newPage();
  await b.goto('/?emulator=1');
  await signInOnGate(b, email, { acceptPolicy: false });
  await b.waitForFunction((c) => window.__hifzOrgId === c, code, { timeout: 20000 });
  expect(await b.evaluate(() => window.__hifzPolicy)).toBe('ok');
  await expect(b.locator('#policy.show')).toHaveCount(0);
  await expect(tileFor(b, 'Student A')).toBeVisible();
  await ctxB.close();
});

test('a raised policy version asks again, with what changed, and over a locked app without unlocking it', async ({ browser }) => {
  test.setTimeout(90000);
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.goto('/?emulator=1');
  const email = newEmail('raised');
  await setupNewClass(page, 'Ustadh Raised', ['Student A', 'Student B'], email);
  await skipTourIfPresent(page);
  const code = await orgId(page), uid = await currentUid(page);
  await expect.poll(async () => (await readAs(page, `users/${uid}`))?.policy?.version, { timeout: 15000 }).toBe('2026-10-27');
  // teacher mode on: the PIN is set and the app is locked
  await page.evaluate(async () => { await savePin('1234'); Store.set(UNLOCKED_KEY, '0'); });

  const changes = ['Reports keep two years of history.', 'Backups include every class.'];
  await ctx.addInitScript((c) => { window.__hifzTestPolicy = { version: '2027-03-01', changes: c }; }, changes);
  await page.reload();
  const gate = page.locator('#policy.show');
  await expect(gate).toBeVisible({ timeout: 20000 });
  await expect(gate).toContainText("We've updated the Terms of use and the Privacy policy. Please read them and accept them to keep using BreakLog.");
  await expect(page.locator('#policyChanges')).toBeVisible();
  await expect(page.locator('#policyChanges h4')).toHaveText("WHAT'S CHANGED");
  await expect(page.locator('#policyChanges li')).toHaveText(changes);
  await expect(page.locator('#policyOut')).toBeVisible();
  for (const [w, h, name] of [[805, 504, 'tablet-landscape-805x504'], [533, 781, 'tablet-portrait-533x781'], [390, 844, 'phone-390x844'], [360, 640, 'phone-360x640']]) {
    await page.setViewportSize({ width: w, height: h });
    await page.locator('#policy .ptoggle').scrollIntoViewIfNeeded();
    // everything on the card can be reached, and nothing runs off the side
    for (const sel of ['#policyTitle', '#termsLink', '#privacyLink', '#policy .ptoggle', '#policyAccept', '#policyOut']) {
      await page.locator(sel).scrollIntoViewIfNeeded();
      const box = await page.locator(sel).boundingBox();
      expect(box.x, `${sel} at ${w}x${h}`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${sel} at ${w}x${h}`).toBeLessThanOrEqual(w + 0.5);
    }
    await page.locator('#policy').evaluate((el) => { el.scrollTop = 0; });
    await shoot(page, name);
  }
  await page.setViewportSize({ width: 805, height: 504 });

  await page.locator('#policy .ptoggle').click();
  await page.waitForTimeout(300);                                             // the switch's slide
  await shoot(page, 'accepted-toggle-on');
  await page.locator('#policyAccept').click();
  await expect(gate).toHaveCount(0);
  await expect.poll(async () => (await readAs(page, `users/${uid}`))?.policy?.version, { timeout: 15000 }).toBe('2027-03-01');
  // still locked, still on the Log tab
  expect(await page.evaluate(() => [document.querySelector('.app').dataset.tab || 'log', teacherOn()])).toEqual(['log', false]);
  expect(await page.evaluate(() => window.__hifzOrgId)).toBe(code);
  await page.reload();
  await page.waitForFunction(() => window.__hifzPolicy === 'ok', null, { timeout: 20000 });
  await expect(page.locator('#policy.show')).toHaveCount(0);
  await ctx.close();
});

test('Sign out on the terms screen signs out, and the next sign-in asks again', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/?emulator=1');
  const email = newEmail('decline');
  await signInOnGate(page, email, { acceptPolicy: false });
  await expect(page.locator('#policy.show')).toBeVisible({ timeout: 20000 });
  await Promise.all([page.waitForEvent('load'), page.locator('#policyOut').click()]);   // signOut() reloads
  await expect(page.locator('#signin.show')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#policy.show')).toHaveCount(0);
  expect(await page.evaluate(async () => { await initFirestore(); return firebase.auth(fbApp).currentUser; })).toBeNull();
  await signInOnGate(page, email, { acceptPolicy: false });
  await expect(page.locator('#policy.show')).toBeVisible({ timeout: 20000 });
  expect(await acceptPolicyIfAsked(page)).toBe(true);
  await expect(page.locator('#setup.show')).toBeVisible({ timeout: 20000 });
});

test('offline, a device that already accepted this version opens straight into a running class', async ({ browser }) => {
  test.setTimeout(90000);
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.goto('/?emulator=1');
  await setupNewClass(page, 'Ustadh Offline', ['Student A', 'Student B']);
  await skipTourIfPresent(page);
  await orgId(page);
  await startClass(page);
  await logBreak(page, 'Student A', 'Water');
  await page.waitForTimeout(1000);

  await goOffline(ctx);
  await page.reload();
  await expect(tileFor(page, 'Student A')).toHaveClass(/out/, { timeout: 15000 });
  await page.waitForFunction(() => window.__hifzPolicy === 'ok', null, { timeout: 15000 });
  await expect(page.locator('#policy.show')).toHaveCount(0);
  await expect(tileFor(page, 'Student B')).toBeVisible();
  await ctx.close();
});

test('offline with a new version not yet known: let in, and asked once back online', async ({ browser }) => {
  test.setTimeout(90000);
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.goto('/?emulator=1');
  await setupNewClass(page, 'Ustadh Later', ['Student A']);
  await skipTourIfPresent(page);
  await orgId(page);
  await page.waitForTimeout(1000);

  await ctx.addInitScript(() => { window.__hifzTestPolicy = { version: '2027-03-01', changes: ['Something new.'] }; });
  await goOffline(ctx);
  await page.reload();
  await page.waitForFunction(() => window.__hifzPolicy === 'deferred', null, { timeout: 20000 });
  await expect(page.locator('#policy.show')).toHaveCount(0);
  await expect(tileFor(page, 'Student A')).toBeVisible();

  await ctx.unroute(EMULATORS);
  await page.evaluate(() => { window.__testOffline = false; window.dispatchEvent(new Event('online')); });
  await expect(page.locator('#policy.show')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#policyChanges li')).toHaveText(['Something new.']);
  expect(await acceptPolicyIfAsked(page)).toBe(true);
  await ctx.close();
});

test('an install from before 3.7 (anonymous, no users doc) is asked too, without Sign out, and keeps its note on the device', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/?emulator=1');
  const code = await createAnonymousClass(page, 'Ustadh Anon', ['Student A']);    // seeds the note as accepted
  const uid = await currentUid(page);
  await page.evaluate(() => localStorage.removeItem('policy.accepted'));         // as it was before 4.2
  await page.reload();
  const gate = page.locator('#policy.show');
  await expect(gate).toBeVisible({ timeout: 20000 });
  await expect(gate).toContainText("We've updated the Terms of use");
  await expect(page.locator('#policyOut')).toBeHidden();
  await page.locator('#policy .ptoggle').click();
  await page.locator('#policyAccept').click();
  await expect(gate).toHaveCount(0);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('policy.accepted')))).toEqual({ [uid]: '2026-10-27' });
  expect(await readAs(page, `users/${uid}`)).toBeNull();                          // no account to put it on
  await page.reload();
  await page.waitForFunction((c) => window.__hifzOrgId === c && window.__hifzPolicy === 'ok', code, { timeout: 20000 });
  await expect(gate).toHaveCount(0);
  await expect(tileFor(page, 'Student A')).toBeVisible();
});
