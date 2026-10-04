// Every screen, at tablet and laptop sizes, both ways up: nothing cut off,
// nothing running off the side, the header always showing the class name,
// date and time. The app was only ever laid out for one landscape tablet;
// upright, the header cut the name to "Hafiz Abdur Rafaye's ..." and hid the
// date, and the day summary's rows ran off the right edge. This checks what a
// teacher would call broken, on every screen, so a later change can't quietly
// bring any of it back.
import { test, expect } from '@playwright/test';

const SIZES = [
  // upright tablets, narrowest first. 533x781 is the teacher's own tablet
  // (1920x1200 at ~2.25x), measured from a screen recording.
  [480, 800], [533, 781], [600, 960], [768, 1024], [834, 1194],
  // landscape tablets and laptops. 805x504 is the same tablet on its side.
  [805, 504], [840, 528], [960, 600], [1024, 768], [1280, 800], [1920, 1080],
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

// Runs in the page: a few weeks of class days for the Reports and Roster tabs,
// in place of the cloud (fetchDayRange is the only way the tabs read history).
function fakeHistory() {
  window.fetchDayRange = async (a, b) => {
    const out = {}; const c = new Date(a + 'T00:00:00'), e = new Date(b + 'T00:00:00'); let k = 0;
    while (c <= e) {
      const id = dayId(c); k++;
      if (c.getDay() % 6 !== 0) {
        const names = {}, att = {}, breaks = [];
        state.students.forEach((s, i) => {
          names[s.id] = s.name;
          att[s.id] = { status: (i + k) % 9 === 0 ? 'absent' : (i + k) % 7 === 0 ? 'tardy' : 'present', note: '' };
          for (let j = 0; j < (i * 3 + k) % 4 + 1; j++) {
            const m = 1 + ((i * 7 + j * 3 + k) % 9);
            breaks.push({ sid: s.id, reason: ['washroom', 'water', 'wudhu', 'other', 'assigned'][(i + j + k) % 5], dur: m * 60000, over: m > 7 ? (m - 7) * 60000 : 0, flag: m > 7, overTrip: false, assignedMin: null });
          }
        });
        const base = +new Date(id + 'T00:00:00');
        out[id] = { date: id, startedAt: base + 8.1 * 3600e3, endedAt: base + 15.4 * 3600e3, names, att, breaks };
      }
      c.setDate(c.getDate() + 1);
    }
    return out;
  };
}

// Runs in the page; returns what a teacher would see as broken.
function problems() {
  const vw = innerWidth, out = [];
  const desc = el => { let s = el.tagName.toLowerCase() + (el.id ? '#' + el.id : el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : ''); const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30); return t ? `${s} "${t}"` : s; };
  const shown = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; } const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const closed = el => !!el.closest('#drawer:not(.show), .scrim:not(.show), .toast:not(.show), .tour:not(.show)');
  const onLog = document.querySelector('.app').dataset.tab === 'log';
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
  if (onLog) for (const id of ['title', 'date', 'clock', 'mainBtn']) { const el = document.getElementById(id); const r = el && el.getBoundingClientRect(); if (!el || !shown(el) || r.right > vw + 1 || r.left < -1) out.push(`header is missing its ${id}`); }
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
  // washroom opens the same stepper since 3.6 (a student who is in class - Muhammad Saeed is out in this seed)
  ['washroom stepper', async p => { await p.locator('.tile', { hasText: 'Ibrahim Khan' }).click(); await p.locator('.reason', { hasText: 'Washroom' }).click(); }],
  ['break editor', async p => { await p.locator('.tile', { hasText: 'Muhammad Saeed' }).click(); }],
  ['day summary', async p => { await p.evaluate(() => openDaySummary()); }],
  ['attendance', async p => { await p.evaluate(() => openAttendanceReview()); }],
  ['reports tab', async p => { await p.locator('.tab[data-tab="reports"]').click(); await p.locator('#viewReports[data-ready="1"]').waitFor(); }],
  ['reports tab, last month, daily average, vs, a bar tapped', async p => {
    await p.locator('.tab[data-tab="reports"]').click(); await p.locator('.rdate[data-range="lastmonth"]').click();
    await p.locator('#viewReports[data-ready="1"]').waitFor();
    await p.evaluate(() => { rpt.mode = 'avg'; rpt.vs = true; rpt.sort = 'most'; paintReports(); rptSelect('s2'); });
  }],
  ['reports tab, one student', async p => {
    await p.locator('.tab[data-tab="reports"]').click(); await p.locator('#viewReports[data-ready="1"]').waitFor();
    await p.evaluate(() => { setRpt('sid', 's7'); setRpt('scope', 'student'); });
  }],
  ['roster tab', async p => { await p.locator('.tab[data-tab="roster"]').click(); await p.waitForTimeout(200); }],
  ['settings tab', async p => { await p.locator('.tab[data-tab="settings"]').click(); }],
  ['tabs tucked away', async p => { await p.locator('.tabhide').click(); await p.waitForTimeout(350); }],
  ['end class', async p => { await p.locator('#mainBtn').click(); }],
  ["a student's breaks today", async p => { await p.evaluate(() => openStudentBreaks('s3')); }],
  ['fixing a logged break', async p => { await p.evaluate(() => { const b = state.breaks.find(x => x.sid === 's2'); editLoggedBreak('s2', b._id || breakDocId(b.sid, b.startAt)); }); }],
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
      await page.evaluate(fakeHistory);
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

// The Reports tab on the teacher's tablet, both ways up, and on other common
// screens: the cards, both charts and the list all fit across the screen,
// the bars are never wider than 24px and every name under them shows inside
// the chart. (Screenshots of 805x504 and 533x781 were checked by eye too.)
for (const [w, h] of [[805, 504], [533, 781], [840, 528], [1280, 800], [480, 800]]) {
  test(`${w}x${h}: the Reports tab fits across the screen`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.route('**/vendor/firebase/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.firebase={initializeApp(){return{}},firestore(){throw new Error("offline")},auth(){throw new Error("offline")}};' }));
    await page.addInitScript(seed, { names: NAMES, status: 'live' });
    await page.goto('/index.html');
    await expect(page.locator('.tile').first()).toBeVisible();
    await page.evaluate(fakeHistory);
    for (const scope of ['class', 'student']) {
      await page.evaluate((sc) => { showTab('reports'); rpt.scope = sc; rpt.sid = 's2'; rpt.vs = true; return drawReports(); }, scope);
      await page.locator('#viewReports[data-ready="1"]').waitFor();
      const r = await page.evaluate(() => {
        const vw = innerWidth, v = document.getElementById('viewReports');
        const svg = document.querySelector('#chart1 svg'), box = document.getElementById('chart1').getBoundingClientRect(), sr = svg.getBoundingClientRect();
        const bars = [...svg.querySelectorAll('rect[fill^="#"]')].filter(x => x.getAttribute('fill') !== '#EEF4F5').map(x => +x.getAttribute('width'));
        const labels = [...svg.querySelectorAll('text.lb')].filter(t => { const tr = t.getBoundingClientRect(); return tr.left < sr.left - 1 || tr.right > sr.right + 1 || tr.bottom > sr.bottom + 1; }).length;
        const wide = [...v.querySelectorAll('.card, .cbox, .rdate, .seg, select')].filter(e => e.getBoundingClientRect().right > vw + 1).length;
        return { sideways: v.scrollWidth > v.clientWidth + 1, svgFits: sr.width <= box.width + 1, maxBar: Math.max(...bars), labels, wide, cards: v.querySelectorAll('.card').length, donut: !!v.querySelector('.donut svg') };
      });
      expect(r, `${scope} at ${w}x${h}`).toEqual({ sideways: false, svgFits: true, maxBar: r.maxBar, labels: 0, wide: 0, cards: 5, donut: true });
      expect(r.maxBar).toBeLessThanOrEqual(24);
    }
    await ctx.close();
  });
}

// Tucked away, the bar leaves a small handle in the bottom-right corner. It
// must never sit on a student's tile - upright the roster runs to the bottom
// of the screen when nobody is out - and the tiles take the space it freed.
for (const [w, h] of [[805, 504], [533, 781], [480, 800], [1280, 800]]) {
  test(`${w}x${h}: the handle for the tucked-away tabs never covers a tile`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.route('**/vendor/firebase/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.firebase={initializeApp(){return{}},firestore(){throw new Error("offline")},auth(){throw new Error("offline")}};' }));
    await page.addInitScript(seed, { names: NAMES, status: 'ended' });
    await page.goto('/index.html');
    await expect(page.locator('.tile').first()).toBeVisible();
    const tileH = () => page.evaluate(() => document.querySelector('.tile').getBoundingClientRect().height);
    const before = await tileH();
    await page.locator('.tabhide').click();
    await page.waitForTimeout(400);
    expect(await tileH(), 'tiles grow into the space').toBeGreaterThan(before);
    const covered = await page.evaluate(() => {
      const hr = document.getElementById('tabHandle').getBoundingClientRect();
      return [...document.querySelectorAll('.tile, .out-item .back')].filter(t => { const r = t.getBoundingClientRect(); return r.left < hr.right && r.right > hr.left && r.top < hr.bottom && r.bottom > hr.top; }).map(t => t.textContent.trim().slice(0, 20));
    });
    expect(covered).toEqual([]);
    expect(await page.evaluate(() => { const g = document.getElementById('grid'); return g.scrollHeight > g.clientHeight + 2; }), 'the roster still fits').toBe(false);
    await ctx.close();
  });
}

// The two smaller actions on a student's break sheet - "See or fix today's
// breaks" and "... left for the day" - must be on screen without scrolling.
// With the break choices in a 3+2 grid they sat 34px below the bottom of the
// sheet on the teacher's tablet in landscape, with nothing showing they were
// there.
for (const [w, h] of [[805, 504], [840, 528], [960, 600], [533, 781], [768, 1024]]) {
  test(`${w}x${h}: a student's break sheet shows every action without scrolling`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.route('**/vendor/firebase/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.firebase={initializeApp(){return{}},firestore(){throw new Error("offline")},auth(){throw new Error("offline")}};' }));
    await page.addInitScript(seed, { names: NAMES, status: 'live' });
    await page.goto('/index.html');
    await expect(page.locator('.tile').first()).toBeVisible();
    await page.locator('.tile', { hasText: 'Abdullah Bhatti' }).click();
    const hidden = await page.evaluate(() => {
      const body = document.querySelector('.scrim.show .sheet .body'), br = body.getBoundingClientRect();
      return [...body.querySelectorAll('.reason, .leftday')].filter(e => e.getBoundingClientRect().bottom > br.bottom + 1).map(e => e.textContent.trim().slice(0, 30));
    });
    expect(hidden, `below the bottom of the sheet at ${w}x${h}`).toEqual([]);
    await ctx.close();
  });
}
