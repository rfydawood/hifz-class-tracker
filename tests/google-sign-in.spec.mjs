// Phase 4 Part A (docs/phase-4.md A4): a class belongs to a Google account.
// The one thing that must never happen is the owner's existing class becoming
// unreachable, so the linking tests start from a class made exactly the way
// every install before 3.7 made it - by an anonymous user - and check that the
// uid, the member doc, the class's teacherUid and every day and break are all
// still there afterwards. See index.html "Google sign-in".
import { test, expect } from '@playwright/test';
import {
  setupNewClass, skipTourIfPresent, orgId, tileFor, startClass, logBreak, returnFromBreak,
  newEmail, useGoogleAccount, signInOnGate, joinExistingClass, openDrawer, mockNativePlatform,
  createAnonymousClass, readAs, currentUid,
} from './helpers.mjs';

async function runADay(page) {
  await startClass(page);
  await logBreak(page, 'Amina', 'Water');
  await returnFromBreak(page, 'Amina');
  await logBreak(page, 'Bilal', 'Washroom');               // still out
  await page.waitForTimeout(1500);                          // every write confirmed
}
const today = (page) => page.evaluate(() => dayId(new Date()));
const breaksOf = (page, code, day) => page.evaluate(async ([code, day]) => {
  const qs = await orgRefFor(code).collection('classes').doc('default').collection('days').doc(day).collection('breaks').get();
  return qs.docs.map((d) => d.data().sid).sort();
}, [code, day]);

async function linkFromMenu(page) {
  await openDrawer(page);
  await page.locator('.dbtn.gold', { hasText: 'Sign in with Google' }).click();
}

test('linking the anonymous tablet to Google keeps the uid, membership, teacher, days and breaks', async ({ browser }) => {
  test.setTimeout(90000);
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.goto('/?emulator=1');
  const code = await createAnonymousClass(page, 'Ustadh Link', ['Amina', 'Bilal']);
  await runADay(page);
  const uid = await currentUid(page);
  const day = await today(page);

  const email = newEmail('link');
  await useGoogleAccount(page, email);
  await linkFromMenu(page);
  await expect(page.locator('#toastMsg')).toContainText('saved to your Google account');

  expect(await currentUid(page)).toBe(uid);                                    // linked, not replaced
  expect(await page.evaluate(() => isGoogleUser())).toBe(true);
  const member = await readAs(page, `orgs/${code}/members/${uid}`);
  expect(member).toMatchObject({ email, roles: ['admin', 'teacher'], status: 'active' });
  expect((await readAs(page, `orgs/${code}/classes/default`)).teacherUid).toBe(uid);
  expect((await readAs(page, `users/${uid}`)).orgIds).toEqual([code]);
  expect(await breaksOf(page, code, day)).toEqual(['s0', 's1']);
  expect((await readAs(page, `orgs/${code}/classes/default/days/${day}`)).session.status).toBe('live');

  // still runs the class
  await returnFromBreak(page, 'Bilal');
  await expect(tileFor(page, 'Bilal')).not.toHaveClass(/out/);
  await openDrawer(page);
  await expect(page.locator('#dbody')).toContainText(`Signed in as ${email}`);

  // a second device signing in with that account lands in the same class
  const ctxB = await browser.newContext(); const b = await ctxB.newPage();
  await b.goto('/?emulator=1');
  await signInOnGate(b, email);
  await b.waitForFunction((c) => window.__hifzOrgId === c, code, { timeout: 20000 });
  await expect(b.locator('#setup.show')).toHaveCount(0);
  await expect(tileFor(b, 'Amina')).toBeVisible();
  await expect.poll(() => b.evaluate(() => state.breaks.length), { timeout: 15000 }).toBe(2);
  await ctx.close(); await ctxB.close();
});

test('on the native app, linking goes through the Google plugin', async ({ browser }) => {
  test.setTimeout(60000);
  const email = newEmail('native');
  const ctx = await browser.newContext();
  await mockNativePlatform(ctx, { googleEmail: email });
  const page = await ctx.newPage();
  await page.goto('/?emulator=1');
  const code = await createAnonymousClass(page, 'Ustadh Native', ['Amina', 'Bilal']);
  const uid = await currentUid(page);
  await linkFromMenu(page);
  await expect(page.locator('#toastMsg')).toContainText('saved to your Google account');
  expect(await page.evaluate(() => window.Capacitor.Plugins.FirebaseAuthentication.calls)).toBe(1);
  expect(await currentUid(page)).toBe(uid);
  expect((await readAs(page, `orgs/${code}/members/${uid}`)).email).toBe(email);
  await ctx.close();
});

test('a Google account that already exists takes the class over by invite, losing nothing', async ({ browser }) => {
  test.setTimeout(90000);
  const email = newEmail('handover');
  // the account signs in on the website first, and gets no further than setup
  const ctxW = await browser.newContext(); const w = await ctxW.newPage();
  await w.goto('/?emulator=1');
  await signInOnGate(w, email);
  await w.locator('#setup.show').waitFor();
  const googleUid = await currentUid(w);
  await ctxW.close();

  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.goto('/?emulator=1');
  const code = await createAnonymousClass(page, 'Ustadh Handover', ['Amina', 'Bilal']);
  await runADay(page);
  const anonUid = await currentUid(page);
  const day = await today(page);

  await useGoogleAccount(page, email);
  await linkFromMenu(page);
  await expect(page.locator('#toastMsg')).toContainText('saved to your Google account', { timeout: 20000 });

  expect(await currentUid(page)).toBe(googleUid);
  expect(await readAs(page, `orgs/${code}/members/${googleUid}`)).toMatchObject({ email, roles: ['admin', 'teacher'], status: 'active' });
  expect((await readAs(page, `orgs/${code}/classes/default`)).teacherUid).toBe(googleUid);
  expect((await readAs(page, `users/${googleUid}`)).orgIds).toEqual([code]);
  expect(await breaksOf(page, code, day)).toEqual(['s0', 's1']);
  expect(anonUid).not.toBe(googleUid);

  // and it keeps running the class, as the Google account
  await returnFromBreak(page, 'Bilal');
  await page.waitForTimeout(1500);
  const bilal = await page.evaluate(async ([code, day]) => {
    const qs = await orgRefFor(code).collection('classes').doc('default').collection('days').doc(day).collection('breaks').where('sid', '==', 's1').get();
    return qs.docs[0].data().endAt;
  }, [code, day]);
  expect(bilal).toBeTruthy();

  // after a reload it is still that account, still in the class
  await page.reload();
  await page.waitForFunction((c) => window.__hifzOrgId === c && window.__hifzSyncStatus === 'synced', code, { timeout: 20000 });
  expect(await currentUid(page)).toBe(googleUid);
  await expect(tileFor(page, 'Amina')).toBeVisible();
  await ctx.close();
});

test('a new user signs in, gets a personal class, and finds it again after signing out', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/?emulator=1');
  await expect(page.locator('#signin.show')).toBeVisible();
  const email = newEmail('new');
  await setupNewClass(page, 'Ustadh New', ['Amina'], email);
  await skipTourIfPresent(page);
  const code = await orgId(page);
  const uid = await currentUid(page);
  expect(await readAs(page, `orgs/${code}`)).toMatchObject({ kind: 'personal' });
  expect(await readAs(page, `orgs/${code}/members/${uid}`)).toMatchObject({ email, roles: ['admin', 'teacher'] });
  expect((await readAs(page, `users/${uid}`)).orgIds).toEqual([code]);

  await openDrawer(page);
  await page.locator('.dbtn', { hasText: `Signed in as ${email}` }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.locator('.sheet h3')).toHaveText('Sign out on this device?');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.locator('#signin.show')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.tile')).toHaveCount(0);

  await signInOnGate(page, email);
  await page.waitForFunction((c) => window.__hifzOrgId === c, code, { timeout: 20000 });
  await expect(tileFor(page, 'Amina')).toBeVisible();
});

test('the sync code no longer lets another account in', async ({ browser }) => {
  test.setTimeout(60000);
  const ctxA = await browser.newContext(); const a = await ctxA.newPage();
  await a.goto('/?emulator=1');
  await setupNewClass(a, 'Ustadh Closed', ['Amina']);
  await skipTourIfPresent(a);
  const code = await orgId(a);

  const ctxB = await browser.newContext(); const b = await ctxB.newPage();
  await b.goto('/?emulator=1');
  await expect(b.getByText('Enter your sync code')).toHaveCount(0);
  await signInOnGate(b, newEmail('stranger'));
  await b.locator('#setup.show').waitFor();                // their own, empty account
  const denied = await b.evaluate(async (code) => {
    try { await orgRefFor(code).get({ source: 'server' }); return false; } catch (e) { return e.code; }
  }, code);
  expect(denied).toBe('permission-denied');
  await ctxA.close(); await ctxB.close();
});
