// Every screen, at tablet and laptop sizes, both ways up: nothing cut off,
// nothing running off the side, the header always showing the class name,
// date and time. The app was only ever laid out for one landscape tablet;
// upright, the header cut the name to "Hafiz Abdur Rafaye's ..." and hid the
// date, and the day summary's rows ran off the right edge. This checks what a
// teacher would call broken, on every screen, so a later change can't quietly
// bring any of it back.
import { test, expect } from '@playwright/test';

const SIZES = [
  // upright tablets, narrowest first - ~550 wide is a typical 10" Android tablet
  [480, 800], [552, 883], [600, 960], [768, 1024], [834, 1194],
  // landscape tablets and laptops - 840x528 is a 10" Android tablet in landscape
  [840, 528], [860, 540], [960, 600], [1024, 768], [1280, 800], [1920, 1080],
];
const NAMES = ['Abdullah Bhatti', 'Ahmed Khan', 'Ibrahim Khan', 'Muhammad Saeed', 'Yusuf Meah', 'Ibrahim Mirza',
  'Mustafa Ansari', 'Noumaan Abdul Azeem', 'Saad Abdul Aziz', 'Suhaib Hasan', 'SaadAttar', 'Abid Patel'];

// A realistic mid-afternoon: a tardy, an early leaver, an absence, two out, flags.
function seed({ names, status }) {
  const d = new Date(), stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const students = names.map((n, i) => ({ id: 's' + i, name: n, active: true }));
  const att = {}; students.forEach(s => { att[s.id] = { status: 'present', at: null, note: '' }; });
  const t0 = Date.now() - 6 * 3600e3;
  att.s1 = { status: 'tardy', at: t0 + 11 * 60000, note: 'Arrived 8:44 AM, 11 min after start' };
  att.s6 = { status: 'left', at: Date.now() - 3600e3, note: 'Left at 2:21 PM' };
  att.s9 = { status: 'absent', at: null, note: 'Deactivated before class' };
  const breaks = []; let ago = 300;
  students.forEach((s, i) => {
    if (i === 9) return;
    for (let k = 0; k < (i % 4) + 2; k++) {
      const m = 3 + k * 2, over = k % 2 ? 2 : 0;
      breaks.push({ sid: s.id, reason: ['washroom', 'water', 'wudhu', 'other'][k % 4], label: 'Break', startAt: Date.now() - ago * 60000, endAt: Date.now() - ago * 60000 + m * 60000, dur: m * 60000, allowMs: 420000, assignedMin: null, over: over * 60000, overTrip: false, flag: k % 2 === 1, note: '' });
      ago -= 4;
    }
  });
  const session = status === 'ended' ? { status: 'ended', startedAt: t0, endedAt: Date.now() - 1800e3, lunchAt: null } : { status: 'live', startedAt: t0, endedAt: null, lunchAt: null };
  const active = status === 'ended' ? {} : {
    s3: { reason: 'washroom', label: 'Washroom', startAt: Date.now() - 540e3, note: '', allowMs: 420000, assignedMin: null, overTrip: false },
    s7: { reason: 'water', label: 'Water', startAt: Date.now() - 50e3, note: '', allowMs: 120000, assignedMin: null, overTrip: true },
  };
  localStorage.setItem('cache.lastClass', JSON.stringify({ day: stamp, teacher: 'Hafiz Abdur Rafaye', students, settings: {}, session, attendance: att, active, breaks }));
}

// Runs in the page; returns what a teacher would see as broken.
function problems() {
  const vw = innerWidth, out = [];
  const desc = el => { let s = el.tagName.toLowerCase() + (el.id ? '#' + el.id : el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : ''); const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30); return t ? `${s} "${t}"` : s; };
  const shown = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; } const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const closed = el => !!el.closest('#drawer:not(.show), .scrim:not(.show), .toast:not(.show), .tour:not(.show)');
  const clipper = el => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) if (getComputedStyle(e).overflowX !== 'visible') return e; return null; };
  const ownText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
  for (const el of document.querySelectorAll('body *')) {
    if (closed(el) || !shown(el)) continue;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 2) out.push(`scrolls sideways: ${desc(el)}`);
    if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) out.push(`cut off with "...": ${desc(el)}`);
    if (ownText(el) || ['BUTTON', 'INPUT', 'SELECT'].includes(el.tagName)) {
      if (r.right > vw + 1 || r.left < -1) out.push(`off the screen edge: ${desc(el)}`);
      const a = clipper(el);
      if (a) { const ar = a.getBoundingClientRect(), acs = getComputedStyle(a);
        if (acs.overflowX !== 'auto' && acs.overflowX !== 'scroll' && (r.right > ar.right + 1.5 || r.left < ar.left - 1.5)) out.push(`clipped: ${desc(el)}`); }
    }
  }
  for (const id of ['title', 'date', 'clock', 'mainBtn']) { const el = document.getElementById(id); const r = el && el.getBoundingClientRect(); if (!el || !shown(el) || r.right > vw + 1 || r.left < -1) out.push(`header is missing its ${id}`); }
  if (document.documentElement.scrollWidth > vw + 1) out.push('the whole page scrolls sideways');
  if (document.querySelector('.app').scrollLeft) out.push('the app has been shifted sideways');
  const g = document.getElementById('grid'); if (g && shown(g) && !document.querySelector('.scrim.show') && g.scrollHeight > g.clientHeight + 2) out.push('the roster needs scrolling');
  return [...new Set(out)];
}

const SCREENS = [
  ['class in session', async () => {}],
  ['class ended', async () => {}, 'ended'],
  ['teacher menu', async p => { await p.locator('.menu-btn[aria-label="Teacher menu"]').click(); await p.waitForTimeout(300); }],
  ['break reasons', async p => { await p.locator('.tile', { hasText: 'Abdullah Bhatti' }).click(); }],
  // clicked straight after the sheet opens, mid slide-in: the tap that used to shift the whole app sideways
  ['minutes stepper', async p => { await p.locator('.tile', { hasText: 'Abdullah Bhatti' }).click(); await p.locator('.reason', { hasText: 'Other' }).click(); }],
  ['break editor', async p => { await p.locator('.tile', { hasText: 'Muhammad Saeed' }).click(); }],
  ['day summary', async p => { await p.evaluate(() => openDaySummary()); }],
  ['attendance', async p => { await p.evaluate(() => openAttendanceReview()); }],
  ['reports, class', async p => { await p.evaluate(() => openReports()); }],
  ['reports, student', async p => { await p.evaluate(() => { rpt.scope = 'student'; rpt.sid = 's7'; return openReports(); }); }],
  ['end class', async p => { await p.locator('#mainBtn').click(); }],
  ['long teacher name', async p => { await p.evaluate(() => { state.teacher = 'Hafiz Muhammad Abdur Rahman Siddiqui'; render(); }); }],
];

for (const [w, h] of SIZES) {
  test(`${w}x${h} ${h > w ? 'upright' : 'landscape'}: every screen fits`, async ({ browser }) => {
    test.setTimeout(90000);
    const found = [];
    for (const [name, open, status] of SCREENS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await ctx.newPage();
      // no network: the layout is what's under test, and it must not wait on Firebase
      await page.route('**/vendor/firebase/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.firebase={initializeApp(){return{}},firestore(){throw new Error("offline")},auth(){throw new Error("offline")}};' }));
      await page.addInitScript(seed, { names: NAMES, status: status || 'live' });
      await page.goto('/index.html');
      await expect(page.locator('.tile').first()).toBeVisible();
      await page.evaluate(() => {
        const names = {}; state.students.forEach(s => { names[s.id] = s.name; });
        const att = {}; Object.entries(state.attendance).forEach(([k, a]) => { att[k] = { status: a.status, at: a.at ? +a.at : null, note: a.note }; });
        window.reportDays = async () => ({ days: [{ date: '2026-09-22', att, names, breaks: state.breaks.map(b => ({ ...b })) }], label: 'Tuesday, Sep 22' });
      });
      await open(page);
      await page.waitForTimeout(400);
      for (const p of await page.evaluate(problems)) found.push(`${name}: ${p}`);
      await ctx.close();
    }
    expect(found, `layout problems at ${w}x${h}`).toEqual([]);
  });
}

test('upright, the header uses two rows; in landscape your name stays on one', async ({ browser }) => {
  for (const [w, h, stacked] of [[552, 883, true], [834, 1194, true], [960, 600, false], [1280, 800, false]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.route('**/vendor/firebase/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.firebase={initializeApp(){return{}},firestore(){throw new Error("offline")},auth(){throw new Error("offline")}};' }));
    await page.addInitScript(seed, { names: NAMES, status: 'live' });
    await page.goto('/index.html');
    await expect(page.locator('.tile').first()).toBeVisible();
    expect(await page.locator('.top').evaluate(e => e.classList.contains('stacked')), `${w}x${h}`).toBe(stacked);
    await ctx.close();
  }
});

// The whole point of the reports screen: the five break categories side by
// side. On a landscape tablet the counts and controls used to push them out
// of view - at 840x528 only three of five showed, and the teacher turned the
// tablet upright to read them.
for (const [w, h] of [[840, 528], [960, 600], [1024, 768], [1280, 800], [552, 883], [768, 1024]]) {
  test(`${w}x${h}: reports show all five break categories without scrolling`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.route('**/vendor/firebase/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.firebase={initializeApp(){return{}},firestore(){throw new Error("offline")},auth(){throw new Error("offline")}};' }));
    await page.addInitScript(seed, { names: NAMES, status: 'live' });
    await page.goto('/index.html');
    await expect(page.locator('.tile').first()).toBeVisible();
    for (const scope of ['class', 'student']) {
      await page.evaluate((sc) => {
        const names = {}; state.students.forEach(s => { names[s.id] = s.name; });
        const att = {}; Object.entries(state.attendance).forEach(([k, a]) => { att[k] = { status: a.status, at: null, note: a.note }; });
        window.reportDays = async () => ({ days: [{ date: '2026-09-22', att, names, breaks: state.breaks.map(b => ({ ...b })) }], label: 'Tuesday, Sep 22' });
        rpt.scope = sc; rpt.sid = 's6'; return openReports();
      }, scope);
      await page.waitForTimeout(300);
      const seen = await page.evaluate(() => {
        const body = document.querySelector('.scrim.show .sheet .body'), br = body.getBoundingClientRect();
        return [...body.querySelectorAll('.stat')].filter(s => { const r = s.getBoundingClientRect(); return r.height > 0 && r.top >= br.top - 1 && r.bottom <= br.bottom + 1; }).length;
      });
      expect(seen, `${scope} report at ${w}x${h}`).toBe(5);
    }
    await ctx.close();
  });
}
