// Settings -> Appearance (4.3): colour themes, light/dark, the background
// behind the tiles. Display preferences for this device only - Store keys
// ui.appearance and ui.bgPhoto, never Firestore. Runs offline like the layout
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
  // red "past the limit" text is today's colour pair (3.9:1) and never changes; muted "not here" tiles are meant to look switched off
  check('.tile.out.long .state, .out-item.long .t, .tile.deact .state, .top .sub, .top .date, .tab:not(.on)', 3);
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
  const saved = await page.evaluate(async () => { const d = Store.get(PHOTO_KEY); const img = new Image(); await new Promise(r => { img.onload = r; img.src = d; });
    return { jpeg: d.startsWith('data:image/jpeg'), w: img.naturalWidth, layer: getComputedStyle(document.getElementById('bgLayer')).backgroundImage.startsWith('url("data:image/jpeg'), bg: document.querySelector('.app').dataset.bg }; });
  expect(saved).toEqual({ jpeg: true, w: 1280, layer: true, bg: 'photo' });

  // Fade
  const fade = page.locator('#apFade');
  await fade.fill('90'); await fade.dispatchEvent('change');
  expect(await page.evaluate(() => [getComputedStyle(document.querySelector('#bgLayer i')).opacity, JSON.parse(Store.get(APPEAR_KEY)).fade])).toEqual(['0.9', 90]);
  await fade.fill('50'); await fade.dispatchEvent('change');
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('#bgLayer i')).opacity)).toBe('0.5');

  // Remove
  await page.getByRole('button', { name: 'Remove' }).click();
  expect(await page.evaluate(() => [Store.get(PHOTO_KEY), localStorage.getItem(PHOTO_KEY), document.querySelector('.app').dataset.bg])).toEqual([null, null, 'plain']);
  expect(await page.evaluate(() => window.__hifzWriteCount)).toBe(0);     // nothing went to Firestore
  await ctx.close();
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
