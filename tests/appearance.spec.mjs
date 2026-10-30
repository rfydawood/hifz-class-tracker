// Settings -> Appearance (4.3): colour themes, light/dark, the background
// behind the tiles. Display preferences for this device only - Store key
// ui.appearance and the photo in IndexedDB (PhotoDB), never Firestore. Runs offline like the layout
// tests (Firebase stubbed), which is also the "works offline" check.
// See index.html paintTheme()/themeTokens() (in <head>), applyAppearance(),
// appearanceSection(), pickPhoto().
import { test, expect } from '@playwright/test';
import { seed, fakeHistory, problems } from './layout-helpers.mjs';
import { mockNativePlatform, readMockPreference } from './helpers.mjs';

const NAMES = ['Bilal R.', 'Hamza T.', 'Yusuf K.', 'Idris M.', 'Zayd H.', 'Musa A.', 'Ilyas N.', 'Harun S.', 'Talha Q.', 'Umar D.', 'Anas F.', 'Khalid B.'];
const OFFLINE = 'window.firebase={initializeApp(){return{}},firestore(){throw new Error("offline")},auth(){throw new Error("offline")}};';
const THEMES = ['classic', 'lapis', 'sand', 'garden', 'night', 'emerald', 'ottoman', 'plum', 'desert', 'midnight', 'grey'];

async function open(browser, size, appearance, { native = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] } });
  if (native) await mockNativePlatform(ctx);
  const page = await ctx.newPage();
  await page.route('**/vendor/firebase/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: OFFLINE }));
  await page.addInitScript(seed, { names: NAMES, status: 'live' });
  if (appearance) await page.addInitScript((a) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('ui.appearance', JSON.stringify(a)); } }, appearance);
  await page.goto('/index.html');
  await expect(page.locator('.tile').first()).toBeVisible();
  await page.evaluate(fakeHistory);
  return { ctx, page };
}

// Runs in the page: where the photo is kept and what is showing.
async function savedPhoto() {
  const b = await PhotoDB.get(); if (!b) return null;
  const img = new Image(); const u = URL.createObjectURL(b); await new Promise(r => { img.onload = r; img.src = u; });
  return { type: b.type, w: img.naturalWidth, h: img.naturalHeight, small: b.size <= 310000, layer: getComputedStyle(document.getElementById('bgLayer')).backgroundImage.startsWith('url("blob:'),
    inStore: Store.get(PHOTO_KEY), inLocal: localStorage.getItem(PHOTO_KEY), flag: JSON.parse(Store.get(APPEAR_KEY)).photo, bg: document.querySelector('.app').dataset.bg };
}
// Runs in the page: a picture of noise as a PNG (base64), so it doesn't compress.
function noisyPng([w, h]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); const d = x.createImageData(w, h);
  let v = 12345; for (let i = 0; i < d.data.length; i += 4) { v = (v * 1103515245 + 12345) & 0x7fffffff; d.data[i] = v & 255; d.data[i + 1] = (v >> 8) & 255; d.data[i + 2] = (v >> 16) & 255; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0); return c.toDataURL('image/png').split(',')[1];
}

// Runs in the page: text that has to be read, against what it sits on.
function readability() {
  const rgb = s => { const m = s.match(/[\d.]+/g).map(Number); return m.slice(0, 3); };
  const L = c => { const v = c.map(x => { x /= 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); }); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
  const cr = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const bgOf = el => { for (let e = el; e; e = e.parentElement) { const b = getComputedStyle(e).backgroundColor; const m = b.match(/[\d.]+/g); if (m && (m.length < 4 || +m[3] > .5)) return rgb(b); } return [255, 255, 255]; };
  const out = [];
  const check = (sel, need) => document.querySelectorAll(sel).forEach(el => {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') return;
    const c = cr(rgb(getComputedStyle(el).color), bgOf(el));
    if (c < need) out.push(`${sel} "${el.textContent.trim().slice(0, 20)}" ${c.toFixed(2)}:1 (needs ${need})`);
  });
  // names, the clock and the header: full contrast
  check('.top h1, .top .clock, .tile.present .name, .tile.out .name, .out-item .who b, .out-item:not(.long) .t, .out-item .back, .panel-head h2', 4.5);
  check('.tile.present .state, .tile.out:not(.long) .state, .tab.on, .card > b, .card h5:not(.warn), .vhead h2, .rs .nm, .rs .wk span:not(.fl), .rdate, .seg button', 4.5);
  // past the limit (#AD4834 on its pink tile, the owner's 4.3 decision), "not here" text, the Back in / Mark in
  // tags, the flag tag, the class-name pill and the Back in buttons: all full contrast now
  check('.tile.out.long .state, .out-item.long .t, .tile.deact .state, .tile.deact .tag, .tile.gone .tag, .tile .tag.flag, .cpill, .out-item .back', 4.5);
  check('.top .sub, .top .date, .tab:not(.on)', 3);
  return out;
}

for (const size of [[805, 504], [533, 781]]) {
  test(`${size.join('x')}: every theme in light and dark, and a custom colour, fits and reads on Log, Reports and Roster`, async ({ browser }) => {
    test.setTimeout(600000);
    const found = [];
    const combos = [...THEMES.map(t => ({ theme: t })), { theme: 'custom', custom: '#4B4FA8' }, { theme: 'custom', custom: '#5E7A2E' }];
    for (const c of combos) for (const mode of ['light', 'dark']) {
      const a = { ...c, mode, bg: 'pattern', pattern: 'khatam' };
      const { ctx, page } = await open(browser, size, a);
      const label = `${c.theme}${c.custom ? ' ' + c.custom : ''} ${mode}`;
      const dark = await page.evaluate(() => document.documentElement.dataset.mode);
      expect(dark, label).toBe(mode === 'dark' || c.theme === 'night' || c.theme === 'midnight' ? 'dark' : 'light');
      for (const [screen, go] of [['log', null], ['reports', 'reports'], ['roster', 'roster']]) {
        if (go) {
          await page.evaluate((t) => showTab(t), go);
          if (go === 'reports') await page.locator('#viewReports[data-ready="1"]').waitFor();
          else await page.waitForTimeout(250);
        }
        for (const p of await page.evaluate(problems)) found.push(`${label} ${screen}: ${p}`);
        for (const p of await page.evaluate(readability)) found.push(`${label} ${screen}: hard to read: ${p}`);
      }
      // the colours that never change
      const fixed = await page.evaluate(() => ({ washroom: getComputedStyle(document.querySelector('.ckey i')).backgroundColor }));
      expect(fixed.washroom, label).toBe('rgb(235, 104, 52)');
      await ctx.close();
    }
    expect(found, `appearance problems at ${size.join('x')}`).toEqual([]);
  });
}

test('the out, past-the-limit and in-class colours keep their meaning in every theme', async ({ browser }) => {
  for (const theme of ['classic', 'plum', 'night']) {
    const { ctx, page } = await open(browser, [805, 504], { theme });
    const c = await page.evaluate(() => {
      const bg = s => getComputedStyle(document.querySelector(s)).borderTopColor;
      return { out: bg('.tile.out:not(.long)'), long: bg('.tile.out.long') };
    });
    // amber and red borders: the light pair, or the dark pair on a dark theme
    expect(['rgb(211, 154, 34)', 'rgb(224, 169, 59)']).toContain(c.out);
    expect(['rgb(192, 80, 58)', 'rgb(224, 103, 74)']).toContain(c.long);
    // the readability check really catches unreadable text (a deliberate break)
    const broken = await page.evaluate((fn) => { const r = document.documentElement.style; r.setProperty('--prest', getComputedStyle(document.documentElement).getPropertyValue('--pres')); return eval(`(${fn})`)(); }, readability.toString());
    expect(broken.some(p => p.startsWith('.tile.present .state')), theme).toBe(true);
    await ctx.close();
  }
});

test('every pattern draws, behind the tiles only', async ({ browser }) => {
  test.setTimeout(120000);
  const { ctx, page } = await open(browser, [805, 504], { theme: 'classic', bg: 'pattern', pattern: 'callig' });
  const ids = await page.evaluate(() => Object.keys(PATTERNS));
  expect(ids).toHaveLength(15);
  for (const id of ids) {
    const r = await page.evaluate(async (id) => {
      saveAppearance({ bg: 'pattern', pattern: id });
      const L = document.getElementById('bgLayer'), i = L.firstElementChild, cs = getComputedStyle(i);
      const mask = cs.webkitMaskImage || cs.maskImage;
      const url = mask.slice(mask.indexOf('"') + 1, mask.lastIndexOf('"'));
      // the SVG really is an image the browser can draw, with something on it
      const ink = await new Promise(res => { const img = new Image(); img.onload = () => {
        const c = document.createElement('canvas'); c.width = 120; c.height = 120; const x = c.getContext('2d');
        x.drawImage(img, 0, 0, 120, 120); const d = x.getImageData(0, 0, 120, 120).data; let n = 0;
        for (let k = 3; k < d.length; k += 4) if (d[k] > 0) n++; res(n); }; img.onerror = () => res(-1); img.src = url; });
      const lr = L.getBoundingClientRect(), stage = document.querySelector('.stage').getBoundingClientRect(), bar = document.getElementById('tabbar').getBoundingClientRect();
      return { cls: i.className, shown: getComputedStyle(L).display, ink, top: Math.round(lr.top - stage.top), coversBar: lr.bottom > bar.top + 1, opacity: +cs.opacity };
    }, id);
    expect(r, id).toEqual({ cls: `pt-${id}`, shown: 'block', ink: r.ink, top: 0, coversBar: false, opacity: 0.1 });
    expect(r.ink, `${id} draws something`).toBeGreaterThan(50);
  }
  // On a dark theme the patterns are gold, still faint.
  const dark = await page.evaluate(() => { saveAppearance({ theme: 'night', pattern: 'mandala' }); const cs = getComputedStyle(document.querySelector('#bgLayer i')); return { c: cs.backgroundColor, o: +cs.opacity }; });
  expect(dark).toEqual({ c: 'rgb(217, 168, 78)', o: 0.2 });
  // Panels and cards stay solid on top of it.
  expect(await page.evaluate(() => [...document.querySelectorAll('.panel, .tile')].every(e => /^rgb\(/.test(getComputedStyle(e).backgroundColor)))).toBe(true);
  await ctx.close();
});

test('a custom photo can be picked, faded and removed - shrunk, kept on this device, never written to the class', async ({ browser }) => {
  test.setTimeout(90000);
  const { ctx, page } = await open(browser, [805, 504], null);
  await page.locator('.tab[data-tab="settings"]').click();
  await page.locator('#viewSettings .seg button[data-bg="photo"]').click();
  await expect(page.locator('.ap-photo')).toContainText('No photo yet');
  // a 2400px-wide picture, made on the spot
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 2400; c.height = 1500; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 2400, 1500); g.addColorStop(0, '#3a7'); g.addColorStop(1, '#a73'); x.fillStyle = g; x.fillRect(0, 0, 2400, 1500); return c.toDataURL('image/png').split(',')[1]; });
  await page.locator('#photoInput').setInputFiles({ name: 'masjid.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.locator('.ap-photo')).toContainText('Your photo, faded');
  await expect(page.locator('.toast')).toContainText('Photo set');
  expect(await page.evaluate(savedPhoto)).toEqual({ type: 'image/jpeg', w: 1280, h: 800, small: true, layer: true, inStore: null, inLocal: null, flag: 1, bg: 'photo' });
  // the Settings page never carries the picture itself, only a short object URL
  expect(await page.evaluate(() => document.getElementById('viewSettings').innerHTML.includes('data:image'))).toBe(false);

  // Fade
  const fade = page.locator('#apFade');
  await fade.fill('90'); await fade.dispatchEvent('change');
  expect(await page.evaluate(() => [getComputedStyle(document.querySelector('#bgLayer i')).opacity, JSON.parse(Store.get(APPEAR_KEY)).fade])).toEqual(['0.9', 90]);
  await fade.fill('50'); await fade.dispatchEvent('change');
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('#bgLayer i')).opacity)).toBe('0.5');

  // It survives a reload: loaded from IndexedDB after the first paint
  await page.reload();
  await expect(page.locator('.tile').first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.getElementById('bgLayer')).backgroundImage)).toMatch(/^url\("blob:/);
  expect(await page.evaluate(savedPhoto)).toMatchObject({ w: 1280, layer: true, inStore: null, inLocal: null, bg: 'photo' });
  await page.locator('.tab[data-tab="settings"]').click();
  await expect(page.locator('.ap-photo')).toContainText('Your photo, faded');

  // Remove
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('.toast')).toContainText('Photo removed');
  expect(await page.evaluate(async () => [await PhotoDB.get(), Store.get(PHOTO_KEY), localStorage.getItem(PHOTO_KEY), document.querySelector('.app').dataset.bg, getComputedStyle(document.getElementById('bgLayer')).backgroundImage])).toEqual([undefined, null, null, 'plain', 'none']);
  expect(await page.evaluate(() => window.__hifzWriteCount)).toBe(0);     // nothing went to Firestore
  await ctx.close();
});

test('clearBgPhoto() (account deleted or signed out) forgets the photo; a tall, oversized photo is bounded', async ({ browser }) => {
  test.setTimeout(90000);
  const { ctx, page } = await open(browser, [805, 504], null);
  await page.locator('.tab[data-tab="settings"]').click();
  await page.locator('#viewSettings .seg button[data-bg="photo"]').click();
  // 1500 x 6000 of noise: hard to compress, so it has to shrink well below 1280 on the long side to fit
  const png = await page.evaluate(noisyPng, [1500, 6000]);
  await page.locator('#photoInput').setInputFiles({ name: 'tall.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.locator('.ap-photo')).toContainText('Your photo, faded');
  const s = await page.evaluate(savedPhoto);
  expect(s).toMatchObject({ type: 'image/jpeg', small: true, layer: true, inStore: null, inLocal: null });
  expect(s.h).toBeLessThanOrEqual(1280);
  expect(s.w / s.h).toBeCloseTo(1500 / 6000, 1);
  // what forgetAccountHere() calls
  await page.evaluate(() => clearBgPhoto());
  expect(await page.evaluate(async () => [await PhotoDB.get(), document.querySelector('.app').dataset.bg, JSON.parse(Store.get(APPEAR_KEY)).photo])).toEqual([undefined, 'plain', 0]);
  await page.reload();
  await expect(page.locator('.tile').first()).toBeVisible();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('bgLayer')).backgroundImage)).toBe('none');
  await ctx.close();
});

test('a photo that cannot be saved says so; an old Store copy moves into IndexedDB once; a bad stored value is never used', async ({ browser }) => {
  test.setTimeout(90000);
  const { ctx, page } = await open(browser, [805, 504], null);
  await page.locator('.tab[data-tab="settings"]').click();
  await page.locator('#viewSettings .seg button[data-bg="photo"]').click();
  await page.evaluate(() => { PhotoDB.put = () => Promise.reject(new Error('QuotaExceededError')); });
  const png = await page.evaluate(noisyPng, [400, 300]);
  await page.locator('#photoInput').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.locator('.toast')).toContainText('That photo could not be saved');
  await expect(page.locator('.ap-photo')).toContainText('No photo yet');
  expect(await page.evaluate(async () => [await PhotoDB.get(), Store.get(PHOTO_KEY), (JSON.parse(Store.get(APPEAR_KEY) || '{}')).photo])).toEqual([undefined, null, undefined]);
  await ctx.close();

  // 4.3's first build kept the photo in Store (ui.bgPhoto): it moves to IndexedDB and leaves localStorage
  const ctx2 = await browser.newContext({ viewport: { width: 805, height: 504 } });
  const p2 = await ctx2.newPage();
  await p2.route('**/vendor/firebase/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: OFFLINE }));
  await p2.addInitScript(seed, { names: NAMES, status: 'live' });
  await p2.addInitScript(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    const c = document.createElement('canvas'); c.width = 640; c.height = 400; const x = c.getContext('2d'); x.fillStyle = '#386'; x.fillRect(0, 0, 640, 400);
    localStorage.setItem('ui.bgPhoto', c.toDataURL('image/jpeg', .8)); localStorage.setItem('ui.appearance', JSON.stringify({ bg: 'photo' })); });
  await p2.goto('/index.html');
  await expect(p2.locator('.tile').first()).toBeVisible();
  await expect.poll(() => p2.evaluate(() => getComputedStyle(document.getElementById('bgLayer')).backgroundImage)).toMatch(/^url\("blob:/);
  expect(await p2.evaluate(savedPhoto)).toMatchObject({ type: 'image/jpeg', w: 640, inStore: null, inLocal: null, flag: 1, bg: 'photo' });
  // a stored value that isn't a JPEG is never used
  await p2.evaluate(() => PhotoDB.put('data:text/html;base64,PGgxPmhpPC9oMT4='));
  await p2.reload();
  await expect(p2.locator('.tile').first()).toBeVisible();
  await expect.poll(() => p2.evaluate(() => JSON.parse(Store.get(APPEAR_KEY)).photo)).toBe(0);
  expect(await p2.evaluate(() => getComputedStyle(document.getElementById('bgLayer')).backgroundImage)).toBe('none');
  await ctx2.close();
});

for (const size of [[805, 504], [533, 781]]) {
  test(`${size.join('x')}: names and timers read over a photo background`, async ({ browser }) => {
    test.setTimeout(120000);
    for (const theme of ['classic', 'night']) {
      const { ctx, page } = await open(browser, size, { theme });
      await page.locator('.tab[data-tab="settings"]').click();
      await page.locator('#viewSettings .seg button[data-bg="photo"]').click();
      const png = await page.evaluate(noisyPng, [900, 600]);
      await page.locator('#photoInput').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
      await expect(page.locator('.ap-photo')).toContainText('Your photo, faded');
      for (const t of ['log', 'reports', 'roster']) {
        await page.evaluate((t) => showTab(t), t);
        if (t === 'reports') await page.locator('#viewReports[data-ready="1"]').waitFor(); else await page.waitForTimeout(250);
        expect(await page.evaluate(problems), `${theme} ${t}`).toEqual([]);
        expect(await page.evaluate(readability), `${theme} ${t}`).toEqual([]);
        // panels and cards stay solid over the photo
        expect(await page.evaluate(() => [...document.querySelectorAll('.panel, .tile, .card')].filter(e => e.offsetWidth).every(e => /^rgb\(/.test(getComputedStyle(e).backgroundColor))), `${theme} ${t}`).toBe(true);
      }
      await ctx.close();
    }
  });

  test(`${size.join('x')}: the skyline and the lanterns show in a strip of their own on Log`, async ({ browser }) => {
    for (const [pattern, edge] of [['skyline', 'bottom'], ['lanterns', 'top']]) {
      const { ctx, page } = await open(browser, size, { theme: 'sand', bg: 'pattern', pattern });
      expect(await page.evaluate(problems), pattern).toEqual([]);
      const strip = await page.evaluate((edge) => {
        const st = document.querySelector('.stage').getBoundingClientRect(), ps = [...document.querySelectorAll('.stage > .panel')].map(p => p.getBoundingClientRect());
        const lo = Math.max(...ps.map(p => p.bottom)), hi = Math.min(...ps.map(p => p.top));
        return edge === 'bottom' ? { x: 0, y: lo, width: st.width, height: st.bottom - lo } : { x: 0, y: st.top, width: st.width, height: hi - st.top };
      }, edge);
      expect(strip.height, `${pattern}: room for it`).toBeGreaterThanOrEqual(24);
      const withIt = await page.screenshot({ clip: strip });
      await page.evaluate(() => saveAppearance({ bg: 'plain' }));
      const without = await page.screenshot({ clip: strip });
      expect(withIt.equals(without), `${pattern} is visible`).toBe(false);
      await ctx.close();
    }
  });
}

test('amber, orange and red can never be the custom colour', async ({ browser }) => {
  const { ctx, page } = await open(browser, [805, 504], { theme: 'custom', custom: '#4B4FA8' });
  await page.locator('.tab[data-tab="settings"]').click();
  // crossed out, not buttons, and tapping them changes nothing
  expect(await page.locator('.ap-dot.no').evaluateAll(els => els.map(e => [e.tagName, e.title]))).toEqual([['SPAN', 'Kept for Out'], ['SPAN', 'Kept for Out'], ['SPAN', 'Kept for Past the limit']]);
  await page.locator('.ap-dot.no').first().click({ force: true });
  expect(JSON.parse(await page.evaluate(() => Store.get(APPEAR_KEY))).custom).toBe('#4B4FA8');
  // the swatches are 44px targets and say which one is chosen
  expect(await page.locator('.ap-dot[data-swatch="#4B4FA8"]').evaluate(e => [e.offsetWidth, e.offsetHeight, e.getAttribute('aria-pressed')])).toEqual([44, 44, 'true']);
  // a stored amber, orange or red (an old or hand-edited value) is refused: the default teal is used
  for (const bad of ['#D39A22', '#E07B2C', '#C0503A', '#FF0000']) {
    const leaf = await page.evaluate((c) => { saveAppearance({ theme: 'custom', custom: c }); return getComputedStyle(document.documentElement).getPropertyValue('--leaf').trim(); }, bad);
    expect(leaf, bad).toBe('#0F7B7B');
  }
  await ctx.close();
});

test('the theme reaches Settings, Profile and the ☰ menu', async ({ browser }) => {
  test.setTimeout(60000);
  for (const [theme, mode, ink, card] of [['lapis', 'light', 'rgb(20, 42, 78)', 'rgb(255, 255, 255)'], ['plum', 'dark', 'rgb(231, 238, 240)', 'rgb(27, 42, 37)']]) {
    const { ctx, page } = await open(browser, [805, 504], { theme, mode, bg: 'tint' });
    for (const t of ['settings', 'profile']) {
      await page.evaluate((t) => showTab(t), t);
      await page.waitForTimeout(250);
      const v = '#view' + t[0].toUpperCase() + t.slice(1);
      expect(await page.evaluate((v) => getComputedStyle(document.querySelector(v + ' h2')).color, v), `${theme} ${t}`).toBe(ink);
      expect(await page.evaluate(problems), `${theme} ${t}`).toEqual([]);
    }
    await page.evaluate(() => { showTab('log'); openDrawer(); });
    await expect(page.locator('#drawer')).toHaveClass(/show/);
    expect(await page.evaluate(() => { const cs = getComputedStyle(document.getElementById('drawer')); return [cs.backgroundColor, cs.color]; }), `${theme} menu`).toEqual([card, ink]);
    await ctx.close();
  }
});

test('the choices survive a reload, are on screen before the app paints, and work on Android/iOS too', async ({ browser }) => {
  test.setTimeout(90000);
  for (const native of [false, true]) {
    const { ctx, page } = await open(browser, [805, 504], null, { native });
    await page.locator('.tab[data-tab="settings"]').click();
    await page.locator('.ap-th[data-theme="lapis"]').click();
    await page.locator('#viewSettings .seg button[data-mode="dark"]').click();
    await page.locator('#viewSettings .seg button[data-bg="pattern"]').click();
    await page.locator('.ap-pat[data-pattern="tulips"]').click();
    if (native) {
      const pref = JSON.parse(await readMockPreference(page, 'ui.appearance'));
      expect(pref).toMatchObject({ theme: 'lapis', mode: 'dark', bg: 'pattern', pattern: 'tulips' });
      expect(JSON.parse(await page.evaluate(() => localStorage.getItem('ui.appearance')))).toMatchObject({ theme: 'lapis' });
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    // before boot has run: the <head> script has already painted the theme
    const early = await page.evaluate(() => ({ head: getComputedStyle(document.documentElement).getPropertyValue('--head').trim(), mode: document.documentElement.dataset.mode }));
    expect(early, native ? 'native' : 'web').toEqual({ head: '#0B1714', mode: 'dark' });
    await expect(page.locator('.tile').first()).toBeVisible();
    await expect(page.locator('#bgLayer i')).toHaveClass('pt-tulips');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--leaf').trim())).toBe('#2C5FA8');   // Lapis keeps its accent in dark
    await ctx.close();
  }
});

test('Automatic follows the tablet', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 805, height: 504 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.route('**/vendor/firebase/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: OFFLINE }));
  await page.addInitScript(seed, { names: NAMES, status: 'live' });
  await page.addInitScript(() => localStorage.setItem('ui.appearance', JSON.stringify({ theme: 'garden', mode: 'auto' })));
  await page.goto('/index.html');
  await expect(page.locator('.tile').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.mode)).toBe('dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.mode)).toBe('light');
  await ctx.close();
});
