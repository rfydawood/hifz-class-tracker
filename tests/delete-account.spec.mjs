// Delete my account (Google Play / App Store account deletion): Profile ->
// Delete my account, and the web page delete-account.html. Both run
// account-delete.js. See index.html askDeleteAccount()/deleteMyAccount()/
// writeDeleteAccount(), firestore.rules closesPersonalOrg().
import { test, expect } from '@playwright/test';
import {
  setupNewClass, skipTourIfPresent, orgId, openTab, startClass, logBreak, returnFromBreak,
  joinExistingClass, currentUid, emailOf, useGoogleAccount, tileFor, newEmail,
  mockNativePlatform,
} from './helpers.mjs';

// Straight to the emulators as an admin, past the rules - to check what is
// really left, not what the app or a signed-in user is allowed to see.
const PROJECT = 'hifz-class-tracker-dece7';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
async function docExists(path) {
  const r = await fetch(`${FS}/${path}`, { headers: OWNER });
  return r.status === 200;
}
async function subcollections(path) {
  const r = await fetch(`${FS}/${path}:listCollectionIds`, { method: 'POST', headers: OWNER, body: '{}' });
  return ((await r.json()).collectionIds) || [];
}
async function countDocs(path) {
  const r = await fetch(`${FS}/${path}?pageSize=300`, { headers: OWNER });
  return (((await r.json()).documents) || []).length;
}
// The Auth emulator keeps the app's users under its own default (demo)
// project when it runs in single-project mode, so look in both.
async function authUserExists(uid) {
  for (const p of [PROJECT, 'demo-no-project']) {
    const r = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${p}/accounts:lookup`,
      { method: 'POST', headers: OWNER, body: JSON.stringify({ localId: [uid] }) });
    if (((await r.json()).users || []).length) return true;
  }
  return false;
}
async function expectAccountGone(code, uid) {
  await expect.poll(() => docExists(`orgs/${code}`), { timeout: 15000 }).toBe(false);
  expect(await subcollections(`orgs/${code}`)).toEqual([]);                    // no members, invites or classes left
  expect(await subcollections(`orgs/${code}/classes/default`)).toEqual([]);     // no days or students
  expect(await countDocs(`orgs/${code}/classes/default/days`)).toBe(0);
  expect(await docExists(`users/${uid}`)).toBe(false);
  expect(await authUserExists(uid)).toBe(false);
}

async function classWithRecords(page) {
  await page.goto('/?emulator=1');
  await setupNewClass(page, 'Ustadh Example', ['Student A', 'Student B']);
  await skipTourIfPresent(page);
  const code = await orgId(page);
  await startClass(page);
  await logBreak(page, 'Student A', 'Washroom');
  await returnFromBreak(page, 'Student A');
  await expect.poll(() => countDocs(`orgs/${code}/classes/default/days`), { timeout: 15000 }).toBe(1);
  return code;
}
async function openDeleteSheet(page) {
  await openTab(page, 'profile');
  await page.locator('.pdanger .pdel').click();
  await expect(page.locator('#sheet h3')).toHaveText('Delete my account?');
}
async function typePin(page, pin) {
  for (const d of pin) await page.locator('.pinkey').filter({ hasText: new RegExp(`^${d}$`) }).click();
}

test('Profile -> Delete my account wipes the class from the cloud, signs out here, and a second device loses access', async ({ browser }) => {
  test.setTimeout(120000);
  const ctxA = await browser.newContext(), ctxB = await browser.newContext();
  const a = await ctxA.newPage(), b = await ctxB.newPage();
  const code = await classWithRecords(a);
  const uid = await currentUid(a);
  expect(await countDocs(`orgs/${code}/classes/default/students`)).toBe(2);
  // the checks below can see the account while it is there
  expect(await authUserExists(uid)).toBe(true);
  expect(await docExists(`users/${uid}`)).toBe(true);
  expect((await subcollections(`orgs/${code}`)).sort()).toEqual(['classes', 'members']);
  expect((await subcollections(`orgs/${code}/classes/default`)).sort()).toEqual(['days', 'students']);

  await b.goto('/?emulator=1');
  await joinExistingClass(b, code);                                       // same account, another device
  await expect(tileFor(b, 'Student A')).toBeVisible({ timeout: 15000 });

  await openDeleteSheet(a);
  await expect(a.locator('#sheet')).toContainText('1 class you own');
  await expect(a.locator('#sheet')).toContainText('Your Google sign-in for BreakLog');
  await expect(a.locator('#sheet')).toContainText("can't be undone");
  await expect(a.getByRole('button', { name: /Download a backup first/ })).toBeVisible();
  await expect(a.locator('#delAcct')).toBeDisabled();
  await a.locator('#delWord').fill('delet');
  await expect(a.locator('#delAcct')).toBeDisabled();
  await a.locator('#delWord').fill('DELETE');
  await a.locator('#delAcct').click();

  // this device: back at the signed-out start screen, nothing of the class kept
  await a.locator('#signin.show').waitFor({ timeout: 20000 });
  await expect(a.locator('#signinErr')).toContainText('have been deleted');
  const left = await a.evaluate(() => ['session.orgId', 'session.classId', 'cache.lastClass', 'hifz.guest.profile', 'teacher.pin'].map((k) => localStorage.getItem(k)));
  expect(left).toEqual([null, null, null, null, null]);

  await expectAccountGone(code, uid);

  // the other device notices, signs out and forgets the class too
  await b.locator('#signin.show').waitFor({ timeout: 20000 });
  await expect(b.locator('#signinErr')).toContainText('was deleted');
  expect(await b.evaluate(() => [localStorage.getItem('session.orgId'), fbUid])).toEqual([null, null]);

  await ctxA.close(); await ctxB.close();
});

test('a deletion cut short part-way is finished by trying again', async ({ page }) => {
  test.setTimeout(120000);
  const code = await classWithRecords(page);
  const uid = await currentUid(page);
  // the first try fails after a few writes (as if the connection dropped)
  const err = await page.evaluate(async () => {
    const p = await HifzAccountDelete.plan(fbDb, fbUid, myEmail(), [ORG_ID]);
    let n = 0;
    try { await HifzAccountDelete.run(fbDb, p, (x) => { if (++n === 3) throw new Error('cut short'); return x; }); }
    catch (e) { return e.message; }
    return 'finished';
  });
  expect(err).toBe('cut short');
  expect(await docExists(`orgs/${code}`)).toBe(true);
  // ...and the Profile button carries on from there
  await openTab(page, 'profile');
  await page.locator('.pdanger .pdel').click();
  await expect(page.locator('#sheet h3')).toHaveText('Delete my account?');
  await page.locator('#delWord').fill('DELETE');
  await page.locator('#delAcct').click();
  await page.locator('#signin.show').waitFor({ timeout: 20000 });
  await expectAccountGone(code, uid);
});

test('teacher mode: Delete my account waits for the PIN', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/?emulator=1');
  await setupNewClass(page, 'Ustadh Example', ['Student A']);
  await skipTourIfPresent(page);
  const code = await orgId(page);
  await page.locator('#lockTab').click();
  await typePin(page, '2468');
  await typePin(page, '2468');
  await page.locator('#lockTab').click();
  await expect(page.locator('#lockLbl')).toHaveText('Locked');

  // Profile, where the button is, is locked
  await page.locator('.tab[data-tab="profile"]').click();
  await expect(page.locator('#sheet h3')).toHaveText('Teacher mode');
  await expect(page.locator('.pdanger .pdel')).toBeHidden();
  await page.locator('#sheet .x').click();
  // and so is the action itself, however it is reached
  await page.evaluate(() => askDeleteAccount());
  await expect(page.locator('#sheet h3')).toHaveText('Teacher mode');
  await typePin(page, '2468');
  await expect(page.locator('#sheet h3')).toHaveText('Delete my account?');
  await page.locator('#sheet .x').click();
  expect(await docExists(`orgs/${code}`)).toBe(true);
});

test('offline, Delete my account is refused and nothing is deleted', async ({ browser }) => {
  test.setTimeout(90000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const code = await classWithRecords(page);

  await ctx.setOffline(true);
  await openTab(page, 'profile');
  await page.locator('.pdanger .pdel').click();
  await expect(page.locator('#toastMsg')).toContainText('needs an internet connection');

  // gone offline after confirming, before it starts
  await ctx.setOffline(false);
  await openDeleteSheet(page);
  await page.locator('#delWord').fill('DELETE');
  await ctx.setOffline(true);
  await page.locator('#delAcct').click();
  await expect(page.locator('#delMsg')).toContainText('needs an internet connection');
  await expect(page.locator('#sheet')).toContainText('Nothing has been deleted');

  await ctx.setOffline(false);
  expect(await docExists(`orgs/${code}`)).toBe(true);
  expect(await countDocs(`orgs/${code}/classes/default/days`)).toBe(1);
  expect(await countDocs(`orgs/${code}/classes/default/students`)).toBe(2);
  expect(await page.evaluate(() => fbUid)).toBeTruthy();
  await ctx.close();
});

test('delete-account.html: sign in, type DELETE, and the account and its class are deleted', async ({ browser }) => {
  test.setTimeout(120000);
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  const code = await classWithRecords(a);
  const uid = await currentUid(a), email = emailOf(a);
  await ctxA.close();

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/delete-account.html?emulator=1');
  await expect(page.locator('h1')).toHaveText('Delete your BreakLog account');
  await expect(page.locator('body')).toContainText('rfy.dawood@gmail.com');
  await useGoogleAccount(page, email);
  await page.locator('#signinBtn').click();
  await expect(page.locator('#who')).toHaveText(email);
  await expect(page.locator('#summary')).toContainText('1 class you own');
  await expect(page.locator('#go')).toBeDisabled();
  await page.locator('#word').fill('DELETE');
  await page.locator('#go').click();
  await expect(page.locator('#msg')).toContainText('have been deleted', { timeout: 20000 });
  await expectAccountGone(code, uid);
  await ctx.close();
});

test('native app: signs in again through the Google plugin, and forgets the class in Preferences and the WebView copy alike', async ({ browser }) => {
  test.setTimeout(120000);
  const email = newEmail();
  const ctx = await browser.newContext();
  await mockNativePlatform(ctx, { googleEmail: email });
  const page = await ctx.newPage();
  await page.goto('/?emulator=1');
  await setupNewClass(page, 'Ustadh Example', ['Student A'], email);
  await skipTourIfPresent(page);
  const code = await orgId(page), uid = await currentUid(page);

  await openDeleteSheet(page);
  await expect(page.locator('#sheet')).toContainText('download a backup first on the website');   // no file downloads in the native app
  await page.locator('#delWord').fill('DELETE');
  await page.evaluate(() => {
    // a pre-Preferences copy left in the WebView's own storage: Store.hydrate()
    // would bring it back on native if only Preferences were cleared
    localStorage.setItem('hifz.tracker.history', JSON.stringify({ '2026-01-05': { date: '2026-01-05', names: { s0: 'Student A' }, att: {}, breaks: [] } }));
    delete window.__hifzTestGoogle;                       // sign in again the native way, through the plugin
    const P = window.Capacitor.Plugins.Preferences, rm = P.remove.bind(P);
    P.remove = async (o) => { sessionStorage.setItem('removed', JSON.stringify([...JSON.parse(sessionStorage.getItem('removed') || '[]'), o.key])); return rm(o); };
    const G = window.Capacitor.Plugins.FirebaseAuthentication, go = G.signInWithGoogle.bind(G);
    G.signInWithGoogle = async () => { sessionStorage.setItem('plugin', 'used'); return go(); };
  });
  await page.locator('#delAcct').click();
  await page.locator('#signin.show').waitFor({ timeout: 20000 });
  const removed = await page.evaluate(() => JSON.parse(sessionStorage.getItem('removed') || '[]'));
  for (const k of ['session.orgId', 'session.classId', 'cache.lastClass', 'hifz.guest.profile', 'hifz.tracker.history']) expect(removed).toContain(k);
  expect(await page.evaluate(() => localStorage.getItem('hifz.tracker.history'))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('plugin'))).toBe('used');
  await expectAccountGone(code, uid);
  await ctx.close();
});
