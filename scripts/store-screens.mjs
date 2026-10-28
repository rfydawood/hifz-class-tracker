#!/usr/bin/env node
// Regenerates the Google Play / App Store screenshots in store-assets/ from
// the real app (index.html), populated with a made-up practice class seeded
// into the LOCAL Firestore + Auth emulators only - never the live project.
//
//   npm run store:screens
//
// That wraps this script in `firebase emulators:exec` with
// scripts/store-screens.firebase.json, which uses its own ports (Firestore
// 8187, Auth 9187, static server 5187) so it can run beside the normal e2e
// suite. index.html points the emulator SDK at 8080/9099; this script
// rewrites those two numbers in the served copy only (index.html on disk is
// untouched).
//
// Every name here is made up (see store-assets/README.md).
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'store-assets');
const FS_PORT = Number(process.env.STORE_FS_PORT || 8187);
const AUTH_PORT = Number(process.env.STORE_AUTH_PORT || 9187);
const WEB_PORT = Number(process.env.STORE_WEB_PORT || 5187);
const ONLY = process.env.STORE_ONLY ? process.env.STORE_ONLY.split(',') : null;   // e.g. STORE_ONLY=play-phone

// ---------- made-up class ----------
const TEACHER = 'Ustadh Kareem';
const EMAIL = 'teacher@example.com';
const CLASS_NAME = 'Morning Hifz Class';
const SECOND_CLASS = 'Evening Revision Class';
const STUDENTS = ['Bilal R.', 'Hamza T.', 'Yusuf A.', 'Ilyas K.', 'Zayd M.', 'Umar S.',
  'Idris N.', 'Musa H.', 'Ali F.', 'Isa B.', 'Harun D.', 'Salman W.'];
const SECOND_STUDENTS = ['Adam L.', 'Nuh P.', 'Ismail G.', 'Dawud C.', 'Ayyub J.', 'Talha V.'];
const THIRD_CLASS = 'Weekend Tajweed Class';
const THIRD_STUDENTS = ['Anas Q.', 'Khalid E.', 'Hasan O.', 'Tariq Y.', 'Faris Z.', 'Imran U.', 'Jamal X.', 'Saad I.'];

// ---------- device sets: CSS viewport x deviceScaleFactor = exact pixels ----------
const DEVICES = [
  { key: 'play-phone',    dir: 'play/phone',      w: 432,  h: 768,  dsf: 2.5, pixels: [1080, 1920] },
  { key: 'play-tablet-7', dir: 'play/tablet-7in', w: 960,  h: 600,  dsf: 2, pixels: [1920, 1200] },
  { key: 'play-tablet-10',dir: 'play/tablet-10in',w: 1280, h: 800,  dsf: 2, pixels: [2560, 1600] },
  { key: 'ios-iphone-69', dir: 'ios/iphone-6.9in',w: 440,  h: 956,  dsf: 3, pixels: [1320, 2868] },
  { key: 'ios-ipad-13',   dir: 'ios/ipad-13in',   w: 1376, h: 1032, dsf: 2, pixels: [2752, 2064] },
];
const SCREENS = ['1-log', '2-reports', '3-roster', '4-classes', '5-settings'];

// ---------- static server (same as scripts/static-server.mjs, ports rewritten) ----------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
function serve() {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p === '/') p = '/index.html';
      const abs = path.join(ROOT, p);
      if (!abs.startsWith(ROOT) || (await stat(abs)).isDirectory()) { res.writeHead(404); return res.end(); }
      let body = await readFile(abs);
      if (p === '/index.html') {
        body = body.toString('utf8')
          .replace("useEmulator('127.0.0.1',8080)", `useEmulator('127.0.0.1',${FS_PORT})`)
          .replace("useEmulator('http://127.0.0.1:9099'", `useEmulator('http://127.0.0.1:${AUTH_PORT}'`);
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(abs)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end('not found'); }
  });
  return new Promise((ok) => server.listen(WEB_PORT, '127.0.0.1', () => ok(server)));
}

// The pictured day: the most recent Thursday, 10:47 am - mid-morning, after
// snack, with Mon-Wed of that week and the whole week before already recorded.
function picturedNow() {
  const d = new Date();
  d.setHours(10, 47, 0, 0);
  while (d.getDay() !== 4) d.setDate(d.getDate() - 1);
  return d;
}

// Small deterministic random, so every run pictures the same class.
function rng(seed) { return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; }

async function signIn(page) {
  await page.locator('#signin.show').waitFor({ timeout: 30000 });
  await page.evaluate(([email, name]) => {
    window.__hifzTestGoogle = { sub: 'g-store-' + email, email, email_verified: true, name };
  }, [EMAIL, TEACHER]);
  await page.locator('#signinBtn').click();
}

// Returns false when this account already has the class (a later device in
// the same run): it then just opens it, like a second device would.
async function setUpClass(page) {
  await signIn(page);
  const fresh = await Promise.race([
    page.locator('#setup.show').waitFor({ timeout: 30000 }).then(() => true),
    page.waitForFunction(() => window.__hifzOrgId && window.__hifzSyncStatus === 'synced', null, { timeout: 30000 }).then(() => false),
  ]).catch(async (e) => {
    console.log('  page says:', (await page.evaluate(() => document.body.innerText)).slice(0, 400));
    throw e;
  });
  if (!fresh) {
    const skip = page.locator('.tour.show .skip');
    if (await skip.count()) await skip.click();
    return false;
  }
  await page.locator('#tName').fill(TEACHER);
  for (const name of STUDENTS) {
    await page.locator('#tStudent').fill(name);
    await page.locator('#tStudent').press('Enter');
  }
  await page.locator('.setup-actions button.dark').click();
  const skip = page.locator('.tour.show .skip');
  await skip.waitFor({ timeout: 5000 }).catch(() => {});
  if (await skip.count()) await skip.click();
  await page.waitForFunction(() => window.__hifzOrgId && window.__hifzSyncStatus === 'synced', null, { timeout: 30000 });

  // made-up names for the class and its org, and a second class for "My classes"
  await page.evaluate(async ([className, second, secondStudents, third, thirdStudents, upcoming]) => {
    await orgRef().set({ name: className }, { merge: true });
    writeClassMeta('default', { name: className }); state.className = className;
    // Fridays finish early; one parents' morning coming up
    const usual = scheduleOf(state.settings).usual;
    const morning = (usual.breaks || []).filter(b => toMin(b.end) <= toMin('12:30'));
    saveSchedule(sc => {
      sc.days[5] = { start: usual.start, end: '12:30', breaks: morning };
      sc.dates[upcoming] = { start: usual.start, end: '11:00', breaks: morning, note: 'Parent meetings' };
    });
    const other = (start, end, days) => {
      const S = JSON.parse(JSON.stringify(state.settings));
      S.schedule = { usual: { start, end, breaks: [] }, days: {}, dates: {} };
      S.startTime = start; S.endTime = end; S.classDays = days;
      return S;
    };
    writeClass(second, other('16:30', '18:30', [1, 2, 3, 4]), secondStudents);
    writeClass(third, other('09:00', '12:00', [6, 7]), thirdStudents);
    render();
  }, [CLASS_NAME, SECOND_CLASS, SECOND_STUDENTS, THIRD_CLASS, THIRD_STUDENTS,
    await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 6); return dayId(d); })]);
  return true;
}

// ---------- the recorded days ----------
const REASONS = ['washroom', 'washroom', 'washroom', 'water', 'water', 'wudhu', 'other', 'assigned'];
async function seedHistory(page, now) {
  const rand = rng(20261022);
  const sids = await page.evaluate(() => state.students.map(s => s.id));
  const limits = await page.evaluate(() => state.settings.limits);
  const days = [];
  // the week before (Mon-Fri) and this week Mon-Wed
  for (let back = 10; back >= 1; back--) {
    const d = new Date(now); d.setDate(d.getDate() - back);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    days.push(d);
  }
  for (const d of days) {
    const id = await page.evaluate((t) => dayId(new Date(t)), +d);
    const at = (h, m) => { const x = new Date(d); x.setHours(h, m, 0, 0); return +x; };
    const att = {};
    sids.forEach((sid) => {
      const r = rand();
      att[sid] = { status: r < 0.06 ? 'absent' : r < 0.13 ? 'tardy' : r < 0.16 ? 'left' : 'present', at: null, note: '' };
      if (att[sid].status === 'tardy') att[sid].at = at(8, 10 + Math.floor(rand() * 20));
    });
    const breaks = [];
    const n = 9 + Math.floor(rand() * 9);
    for (let i = 0; i < n; i++) {
      const sid = sids[Math.floor(rand() * sids.length)];
      if (att[sid].status === 'absent') continue;
      const reason = REASONS[Math.floor(rand() * REASONS.length)];
      // a time in class, avoiding snack (10:10-10:20) and lunch (12:05-2:05)
      const slots = [[8, 20, 100], [10, 25, 95], [14, 10, 75]];
      const [h, m, span] = slots[Math.floor(rand() * slots.length)];
      const startAt = at(h, m) + Math.floor(rand() * span) * 60000;
      const capped = !!limits[reason];
      const lim = (capped ? limits[reason].min : 4) * 60000;
      const dur = Math.round(lim * (0.4 + rand() * 0.85));
      const over = capped ? Math.max(0, dur - lim) : 0;
      breaks.push({ sid, reason, startAt, endAt: startAt + dur, dur, over, flag: over > 0, overTrip: false,
        assignedMin: reason === 'assigned' ? 5 : null });
    }
    const ok = await page.evaluate(([id, att, br, session]) => window.__hifzTestSeedDay(id, att, br, session),
      [id, att, breaks, { status: 'ended', startedAt: at(8, 0), endedAt: at(15, 30) }]);
    if (!ok) throw new Error('seeding ' + id + ' failed');
  }
}

// Today: class running since 8:02, two absent, one tardy, three out now, a
// handful of trips already back.
async function seedToday(page, now) {
  await page.evaluate(async ([now]) => {
    const T = (h, m) => { const x = new Date(now); x.setHours(h, m, 0, 0); return +x; };
    const ids = state.students.map(s => s.id);
    const att = {};
    ids.forEach(sid => { att[sid] = { status: 'present', at: null, note: '' }; });
    att[ids[4]] = { status: 'absent', at: null, note: '' };
    att[ids[9]] = { status: 'tardy', at: T(8, 21), note: '' };
    const done = (i, reason, h, m, min, sec = 0) => {
      const L = state.settings.limits[reason], startAt = T(h, m), dur = (min * 60 + sec) * 1000;
      const over = L ? Math.max(0, dur - L.min * 60000) : 0;
      return { sid: ids[i], reason, startAt, endAt: startAt + dur, dur, over, flag: over > 0, overTrip: false, assignedMin: reason === 'assigned' ? 5 : null };
    };
    const out = (i, reason, minAgo, secAgo = 0) => ({ sid: ids[i], reason, startAt: now - (minAgo * 60 + secAgo) * 1000,
      endAt: null, dur: null, over: null, flag: null, overTrip: false, assignedMin: reason === 'assigned' ? 5 : null });
    const breaks = [
      done(0, 'water', 8, 34, 2, 10), done(2, 'washroom', 8, 51, 5, 40), done(5, 'wudhu', 9, 12, 6, 5),
      done(7, 'washroom', 9, 40, 8, 30), done(1, 'water', 10, 26, 1, 45), done(10, 'other', 9, 58, 3, 20),
      out(3, 'washroom', 4, 12), out(6, 'water', 1, 35), out(8, 'wudhu', 6, 50),
    ];
    await window.__hifzTestSeedDay(dayId(new Date(now)), att, breaks,
      { status: 'live', startedAt: T(8, 2), endedAt: null });
  }, [+now]);
}

async function shot(page, dev, name) {
  const file = path.join(OUT, dev.dir, `${name}.png`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: file, animations: 'disabled' });
  console.log('  wrote', path.relative(ROOT, file));
}

async function openTab(page, name) {
  await page.locator(`.tab[data-tab="${name}"]`).click();
  await page.locator(`.app[data-tab="${name}"]`).waitFor();
}

async function run() {
  const server = await serve();
  const browser = await chromium.launch();
  const now = picturedNow();
  console.log('Pictured day:', now.toString());
  try {
    for (const dev of DEVICES) {
      if (ONLY && !ONLY.includes(dev.key)) continue;
      console.log(dev.key, `${dev.w}x${dev.h} @${dev.dsf}`);
      await mkdir(path.join(OUT, dev.dir), { recursive: true });
      const context = await browser.newContext({ viewport: { width: dev.w, height: dev.h }, deviceScaleFactor: dev.dsf,
        isMobile: false, hasTouch: true, colorScheme: 'light', locale: 'en-US', serviceWorkers: 'block' });
      const page = await context.newPage();
      page.on('pageerror', (e) => console.log('  page error:', e.message));
      if (process.env.STORE_DEBUG) page.on('console', (m) => console.log('  console:', m.text().slice(0, 200)));
      await page.clock.setFixedTime(now);
      await page.goto(`http://127.0.0.1:${WEB_PORT}/index.html?emulator=1`);
      if (await setUpClass(page)) {
        await seedHistory(page, now);
        await seedToday(page, now);
      }
      await page.waitForFunction(() => Object.keys(state.active).length === 3, null, { timeout: 20000 });
      await page.evaluate(() => document.fonts.ready);

      await openTab(page, 'log');
      await shot(page, dev, SCREENS[0]);

      await openTab(page, 'reports');
      await page.locator('.rdate[data-range="thisweek"]').click();
      await page.locator('#viewReports[data-ready="1"]').waitFor({ timeout: 20000 });
      await shot(page, dev, SCREENS[1]);

      await openTab(page, 'roster');
      await shot(page, dev, SCREENS[2]);

      await openTab(page, 'profile');
      await page.locator('.ccard').nth(1).waitFor();
      // narrow screens stack the cards: scroll to "Backup" so the whole of
      // "My classes" is in view below it, with nothing cut at the top
      await page.locator('.pclasses').evaluate((el) => {
        if (el.getBoundingClientRect().top < innerHeight * 0.45) return;
        const h = [...document.querySelectorAll('#viewProfile .pcard h4')].find((x) => x.textContent.trim() === 'Backup');
        let sc = el.parentElement;
        while (sc && !(sc.scrollHeight > sc.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
        sc = sc || document.scrollingElement;
        sc.scrollTop += h.getBoundingClientRect().top - (sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top) - 20;
      });
      await shot(page, dev, SCREENS[3]);

      await openTab(page, 'settings');
      await shot(page, dev, SCREENS[4]);
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
