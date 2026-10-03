// Phase 4 Part B: schools. An admin creates a school and invites teachers by
// email; a teacher signs in and is let straight in, sets up their own class
// and runs it; the admin watches any class, read-only; a code lets someone
// in who signed in with a different address; a school always keeps an
// admin; a teacher removed from the school loses it on their device; and a
// device's old local history never lands in a school's records.
import { test, expect } from '@playwright/test';
import {
  signInOnGate, fillSetup, skipTourIfPresent, tileFor, startClass, logBreak, openDrawer,
  orgId, currentUid, readAs, setupNewClass, seedLegacyLocalHistory, waitForMigration, dayIdBack,
} from './helpers.mjs';

const DOMAIN = 'uthmanacademy.org';
let n = 0;
const schoolEmail = (who) => `${who}-${Date.now().toString(36)}-${++n}@${DOMAIN}`;

async function device(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/?emulator=1');
  return { ctx, page };
}

async function createSchool(page, email, name = 'Uthman Academy Hifz') {
  await signInOnGate(page, email);
  await page.locator('#welcome.show').waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'Create a school' }).click();
  await page.locator('#wSchool').fill(name);
  await expect(page.locator('#wDomain')).toBeChecked();             // a school address: locked to its domain by default
  await page.getByRole('button', { name: 'Create school' }).click();
  await expect(page.locator('.sheet h3')).toHaveText(name, { timeout: 20000 });   // straight to its (empty) list of classes
  await expect(page.locator('.sheet')).toContainText('No classes yet');
  return orgId(page);
}

// Admin: People -> Invite someone -> the message to send; returns the code.
async function invite(page, email, roleLabel = 'Teacher') {
  const sheetTitle = await page.locator('#scrim.show .sheet h3').textContent().catch(() => '');
  if (sheetTitle !== 'People') {
    await openDrawer(page);
    await page.locator('.dbtn', { hasText: 'People' }).click();
  }
  await page.getByRole('button', { name: 'Invite someone' }).click();
  await page.locator('#invEmail').fill(email);
  if (roleLabel !== 'Teacher') await page.locator('.sheet .seg button', { hasText: new RegExp(`^${roleLabel}$`) }).click();
  await page.getByRole('button', { name: 'Create invite' }).click();
  await expect(page.locator('.sheet h3')).toHaveText('Send the invite', { timeout: 15000 });
  const msg = await page.locator('#invMsg').textContent();
  expect(msg).toContain(email);
  return msg.match(/invite code when asked: ([A-Z0-9]{5}-[A-Z0-9]{5})/)[1];
}

async function backToPeople(page) {
  await page.getByRole('button', { name: 'Back to People' }).click();
  await expect(page.locator('.sheet h3')).toHaveText('People', { timeout: 15000 });
}

test('an invited teacher signs in, is let straight in, and runs their own class; the admin watches it read-only', async ({ browser }) => {
  test.setTimeout(150000);
  const admin = await device(browser);
  const adminEmail = schoolEmail('admin');
  const school = await createSchool(admin.page, adminEmail);
  expect(await readAs(admin.page, `orgs/${school}`)).toMatchObject({ kind: 'organization', domain: DOMAIN, name: 'Uthman Academy Hifz' });

  // only school addresses
  await admin.page.locator('.sheet').getByRole('button', { name: 'People' }).click();
  await admin.page.getByRole('button', { name: 'Invite someone' }).click();
  await admin.page.locator('#invEmail').fill('musa@gmail.com');
  await admin.page.getByRole('button', { name: 'Create invite' }).click();
  await expect(admin.page.locator('#invErr')).toHaveText(`Only @${DOMAIN} addresses can join this school.`);
  await admin.page.getByRole('button', { name: 'Back' }).click();
  const musaEmail = schoolEmail('musa');
  await invite(admin.page, musaEmail);
  await backToPeople(admin.page);
  await expect(admin.page.locator('.sheet')).toContainText(musaEmail);

  // the teacher: sign in, no code, straight to setting up their class at the school
  const musa = await device(browser);
  await signInOnGate(musa.page, musaEmail);
  await musa.page.locator('#setup.show').waitFor({ timeout: 20000 });
  await expect(musa.page.locator('#setupLede')).toContainText('Uthman Academy Hifz');
  await fillSetup(musa.page, 'Ustadh Musa', ['Amina', 'Bilal']);
  await skipTourIfPresent(musa.page);
  await expect(tileFor(musa.page, 'Amina')).toBeVisible({ timeout: 20000 });
  const musaUid = await currentUid(musa.page);
  expect(await musa.page.evaluate(() => CLASS_ID)).toBe(musaUid);
  expect(await readAs(musa.page, `orgs/${school}/members/${musaUid}`)).toMatchObject({ roles: ['teacher'], status: 'active', displayName: 'Ustadh Musa' });
  await startClass(musa.page);
  await logBreak(musa.page, 'Amina', 'Water');
  await expect(musa.page.locator('.out-item', { hasText: 'Amina' })).toBeVisible();

  // the school's settings are the admin's: the teacher sees them, can't change them
  await openDrawer(musa.page);
  await expect(musa.page.locator('#dbody')).toContainText("Set by your school's admin");
  await expect(musa.page.locator('#dbody .field select')).toHaveCount(0);
  await expect(musa.page.locator('#dbody .dbtn', { hasText: 'People' })).toHaveCount(0);
  await musa.page.locator('.dhead .menu-btn').click();

  // the admin opens the class: live, but view only
  await admin.page.locator('.sheet .x').click();
  await openDrawer(admin.page);
  await admin.page.locator('.dbtn', { hasText: 'Classes' }).click();
  const row = admin.page.locator('.sheet .prow', { hasText: "Ustadh Musa's Hifz Class" });
  await expect(row).toContainText('in class since');
  await row.getByRole('button', { name: 'Open' }).click();
  await expect(tileFor(admin.page, 'Bilal')).toBeVisible({ timeout: 20000 });
  await expect(admin.page.locator('#title')).toHaveText("Ustadh Musa's Hifz Class");
  await expect(admin.page.locator('#banner')).toContainText('View only');
  await expect(admin.page.locator('#mainBtn')).toBeHidden();
  await expect(admin.page.locator('.out-item', { hasText: 'Amina' })).toBeVisible({ timeout: 15000 });
  await tileFor(admin.page, 'Bilal').click();
  await expect(admin.page.locator('#toastMsg')).toContainText('View only');
  await expect(admin.page.locator('#scrim.show')).toHaveCount(0);           // no break sheet
  // and the record agrees: nothing the admin can write to the class's day
  const denied = await admin.page.evaluate(async () => {
    try { await dayRef().set({ date: TODAY_ID, yearId: '2026-2027', attendance: {}, roster: {} }, { merge: true }); return 'written'; }
    catch (e) { return e.code; }
  });
  expect(denied).toBe('permission-denied');

  // a live change on the teacher's device reaches the admin's screen
  await tileFor(musa.page, 'Amina').click();
  await musa.page.getByRole('button', { name: 'Return Amina' }).click();
  await expect(admin.page.locator('.out-item', { hasText: 'Amina' })).toHaveCount(0, { timeout: 15000 });

  // back to the school's list; the admin's own device never cached Musa's class
  await admin.page.locator('#banner').getByRole('button', { name: 'Back to classes' }).click();
  await expect(admin.page.locator('.sheet h3')).toHaveText('Uthman Academy Hifz', { timeout: 15000 });
  expect(await admin.page.evaluate(() => Store.get('cache.lastClass'))).toBeFalsy();
  await admin.ctx.close(); await musa.ctx.close();
});

test('a code lets in someone who signed in with another school address - and only a school address', async ({ browser }) => {
  test.setTimeout(120000);
  const admin = await device(browser);
  await createSchool(admin.page, schoolEmail('admin'));
  await admin.page.locator('.sheet').getByRole('button', { name: 'People' }).click();
  const code = await invite(admin.page, schoolEmail('typo'));

  const gmail = await device(browser);
  await signInOnGate(gmail.page, `outsider-${Date.now().toString(36)}@gmail.com`);
  await gmail.page.locator('#welcome.show').waitFor({ timeout: 20000 });
  await gmail.page.locator('#wCode').fill(code.toLowerCase().replace('-', ' '));
  await gmail.page.getByRole('button', { name: 'Join' }).click();
  await expect(gmail.page.locator('#welcomeErr')).toContainText("That code didn't work");

  const other = await device(browser);
  await signInOnGate(other.page, schoolEmail('other'));
  await other.page.locator('#welcome.show').waitFor({ timeout: 20000 });
  await other.page.getByRole('button', { name: 'Check again' }).click();
  await expect(other.page.locator('#welcomeErr')).toContainText('No invite for');
  await other.page.locator('#wCode').fill(code);
  await other.page.getByRole('button', { name: 'Join' }).click();
  await other.page.locator('#setup.show').waitFor({ timeout: 20000 });     // in, and setting up their class

  // used once
  const late = await device(browser);
  await signInOnGate(late.page, schoolEmail('late'));
  await late.page.locator('#welcome.show').waitFor({ timeout: 20000 });
  await late.page.locator('#wCode').fill(code);
  await late.page.getByRole('button', { name: 'Join' }).click();
  await expect(late.page.locator('#welcomeErr')).toContainText("That code didn't work");
  for (const d of [admin, gmail, other, late]) await d.ctx.close();
});

test('the founder hands the school to an admin and steps down; a school never runs out of admins', async ({ browser }) => {
  test.setTimeout(150000);
  const founder = await device(browser);
  const school = await createSchool(founder.page, schoolEmail('founder'));
  const founderUid = await currentUid(founder.page);
  await founder.page.locator('.sheet').getByRole('button', { name: 'People' }).click();

  // alone, the founder can't step down
  const me = founder.page.locator('.sheet .prow', { hasText: '(you)' });
  await me.getByRole('button', { name: 'Admin' }).click();
  await expect(founder.page.locator('#toastMsg')).toContainText('Make someone else an admin first');

  const headEmail = schoolEmail('head');
  await invite(founder.page, headEmail, 'Admin');
  const head = await device(browser);
  await signInOnGate(head.page, headEmail);
  await expect(head.page.locator('.sheet h3')).toHaveText('Uthman Academy Hifz', { timeout: 20000 });    // an admin who doesn't teach: the classes
  const headUid = await currentUid(head.page);

  await backToPeople(founder.page);
  await founder.page.locator('.sheet').getByRole('button', { name: 'Classes' }).click();
  await founder.page.locator('.sheet').getByRole('button', { name: 'People' }).click();
  await expect(founder.page.locator('.sheet .prow', { hasText: headEmail })).toBeVisible();
  await founder.page.locator('.sheet .prow', { hasText: '(you)' }).getByRole('button', { name: 'Admin' }).click();
  await expect(founder.page.locator('.sheet h3')).toHaveText('Step down as admin?');
  await founder.page.getByRole('button', { name: 'Step down' }).click();
  await expect(founder.page.locator('#toastMsg')).toContainText('no longer an admin', { timeout: 15000 });
  expect(await readAs(founder.page, `orgs/${school}/members/${founderUid}`)).toMatchObject({ roles: ['teacher'], steppedDownFor: headUid });

  // now a teacher: no People, and their own class to set up
  await expect(founder.page.locator('#banner')).toContainText('Your class is not set up yet', { timeout: 15000 });
  await openDrawer(founder.page);
  await expect(founder.page.locator('#dbody .dbtn', { hasText: 'People' })).toHaveCount(0);
  await founder.page.locator('.dhead .menu-btn').click();
  await founder.page.locator('#banner').getByRole('button', { name: 'Set up' }).click();
  await founder.page.locator('#setup.show').waitFor();
  await fillSetup(founder.page, 'Ustadh Rafay', ['Yusuf']);
  await skipTourIfPresent(founder.page);
  await expect(tileFor(founder.page, 'Yusuf')).toBeVisible({ timeout: 20000 });

  // the head is now the only admin, and the app won't let them step down either
  await head.page.locator('.sheet .x').click();
  await openDrawer(head.page);
  await head.page.locator('.dbtn', { hasText: 'People' }).click();
  await head.page.locator('.sheet .prow', { hasText: '(you)' }).getByRole('button', { name: 'Admin' }).click();
  await expect(head.page.locator('#toastMsg')).toContainText('Make someone else an admin first');
  await founder.ctx.close(); await head.ctx.close();
});

test('a teacher removed from the school loses it on their device straight away; their class stays with the school', async ({ browser }) => {
  test.setTimeout(150000);
  const admin = await device(browser);
  const school = await createSchool(admin.page, schoolEmail('admin'));
  await admin.page.locator('.sheet').getByRole('button', { name: 'People' }).click();
  const teacherEmail = schoolEmail('leaver');
  await invite(admin.page, teacherEmail);

  const t = await device(browser);
  await signInOnGate(t.page, teacherEmail);
  await t.page.locator('#setup.show').waitFor({ timeout: 20000 });
  await fillSetup(t.page, 'Ustadh Leaver', ['Amina']);
  await skipTourIfPresent(t.page);
  await expect(tileFor(t.page, 'Amina')).toBeVisible({ timeout: 20000 });
  const uid = await currentUid(t.page);

  await backToPeople(admin.page);
  await admin.page.locator('.sheet .prow', { hasText: teacherEmail }).getByRole('button', { name: 'Remove' }).click();
  await admin.page.locator('.sheet .actions').getByRole('button', { name: 'Remove' }).click();
  await expect(t.page.locator('#welcome.show')).toBeVisible({ timeout: 20000 });
  await expect(t.page.locator('#welcomeCard')).toContainText('no longer a member of Uthman Academy Hifz');
  expect(await t.page.evaluate(() => Store.get('session.orgId'))).toBeFalsy();
  expect((await readAs(t.page, `users/${uid}`)).orgIds).not.toContain(school);
  // after a reload too: no way back in
  await t.page.reload();
  await t.page.locator('#welcome.show').waitFor({ timeout: 20000 });
  // the class and its records are still the school's
  expect(await readAs(admin.page, `orgs/${school}/classes/${uid}`)).toMatchObject({ name: "Ustadh Leaver's Hifz Class", teacherUid: uid });
  await admin.ctx.close(); await t.ctx.close();
});

test('switching the tablet from a personal class to the school: the old class is kept, its history stays out of the school', async ({ browser }) => {
  test.setTimeout(150000);
  const admin = await device(browser);
  const school = await createSchool(admin.page, schoolEmail('admin'));
  await admin.page.locator('.sheet').getByRole('button', { name: 'People' }).click();
  const schoolAddress = schoolEmail('rafay');
  await invite(admin.page, schoolAddress);

  // the tablet: a personal class, with local history from before it synced
  const ctx = await browser.newContext();
  const pg = await ctx.newPage();
  await pg.goto('/?emulator=1');
  const old1 = await dayIdBack(pg, 30), old2 = await dayIdBack(pg, 31);
  const legacy = Object.fromEntries([old1, old2].map((d) => [d, { date: d, startedAt: null, endedAt: null, names: { s0: 'Amina' },
    att: { s0: { status: 'present' } }, breaks: [{ sid: 's0', reason: 'water', dur: 60000, over: 0, flag: false }] }]));
  await seedLegacyLocalHistory(ctx, legacy);
  await pg.evaluate(() => localStorage.removeItem('migration.legacyHistoryDone.v2'));
  await pg.reload();
  const gmail = `personal-${Date.now().toString(36)}@gmail.com`;
  await setupNewClass(pg, 'Rafay Personal', ['Amina']);
  await skipTourIfPresent(pg);
  const personal = await orgId(pg);
  await waitForMigration(pg);

  // Switch account (teacher menu) -> the school account -> the school
  await openDrawer(pg);
  await pg.locator('.dbtn', { hasText: 'Switch account' }).click();
  await expect(pg.locator('.sheet h3')).toHaveText('Switch account?');
  await pg.locator('.sheet .actions').getByRole('button', { name: 'Switch account' }).click();
  await expect(pg.locator('#signin.show')).toBeVisible({ timeout: 15000 });
  await pg.evaluate(() => Store.remove('migration.legacyHistoryDone.v2'));   // as if it had never finished
  await signInOnGate(pg, schoolAddress);
  await pg.locator('#setup.show').waitFor({ timeout: 20000 });
  await fillSetup(pg, 'Ustadh Rafay', ['Yusuf', 'Zayd']);
  await skipTourIfPresent(pg);
  await expect(tileFor(pg, 'Yusuf')).toBeVisible({ timeout: 20000 });
  await expect(tileFor(pg, 'Amina')).toHaveCount(0);
  const uid = await currentUid(pg);
  await pg.waitForTimeout(2000);
  const days = await pg.evaluate(async ([school, uid]) => (await orgRefFor(school).collection('classes').doc(uid).collection('days').get()).docs.map((d) => d.id), [school, uid]);
  expect(days).not.toContain(old1);
  expect(days).not.toContain(old2);
  expect(await pg.evaluate(() => ORG_ID)).toBe(school);
  expect(personal).not.toBe(school);
  void gmail;
  await admin.ctx.close(); await ctx.close();
});
