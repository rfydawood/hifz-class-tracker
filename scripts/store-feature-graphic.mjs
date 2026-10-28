#!/usr/bin/env node
// Google Play feature graphic (1024x500): the app icon, the app's name and a
// tagline, in the app's own colours and font (Manrope, from Google Fonts as
// in index.html). Rendered as a small HTML page with Playwright.
// Needs store-assets/ios/icon-1024.png first (scripts/store_icons.py).
//   npm run store:images
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'store-assets/play/feature-graphic.png');
const NAME = 'BreakLog';
const TAGLINE = 'Class breaks and attendance<br>for hifz teachers';

const icon = (await readFile(path.join(ROOT, 'store-assets/ios/icon-1024.png'))).toString('base64');
// Break-type colours are the app's fixed ones (see CLAUDE.md "App layout").
const chips = [['Washroom', '#eb6834'], ['Water', '#2a78d6'], ['Wudhu', '#1baf7a'], ['Attendance', '#0F7B7B']];

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:1024px;height:500px;overflow:hidden}
  body{background:#E3EAEC;font-family:"Manrope",system-ui,sans-serif;color:#1F2E36;
    display:flex;align-items:center;justify-content:center;gap:56px;padding:0 64px}
  .icon{width:236px;height:236px;border-radius:53px;flex:none;
    box-shadow:0 18px 40px rgba(31,46,54,.18),0 2px 6px rgba(31,46,54,.12)}
  h1{font-size:92px;font-weight:800;letter-spacing:-.035em;line-height:1}
  p{font-size:27px;font-weight:600;color:#5B6B73;line-height:1.3;margin-top:16px;max-width:520px}
  .chips{display:flex;gap:10px;margin-top:26px}
  .chip{font-size:17px;font-weight:700;padding:7px 14px 7px 12px;border-radius:999px;background:#fff;
    display:flex;align-items:center;gap:8px;border:1px solid #D6DFE2}
  .chip i{width:11px;height:11px;border-radius:50%;display:block}
</style></head><body>
  <img class="icon" src="data:image/png;base64,${icon}" alt="">
  <div>
    <h1>${NAME}</h1>
    <p>${TAGLINE}</p>
    <div class="chips">${chips.map(([t, c]) => `<span class="chip"><i style="background:${c}"></i>${t}</span>`).join('')}</div>
  </div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const font = await page.evaluate(() => document.fonts.check('800 92px Manrope'));
if (!font) console.warn('warning: Manrope did not load (offline?) - the graphic used a fallback font');
// keep everything well inside the edges
const box = await page.evaluate(() => {
  const r = [...document.body.children].map((e) => e.getBoundingClientRect());
  return { l: Math.min(...r.map((x) => x.left)), t: Math.min(...r.map((x) => x.top)), r: Math.max(...r.map((x) => x.right)), b: Math.max(...r.map((x) => x.bottom)) };
});
if (box.l < 48 || box.t < 48 || box.r > 1024 - 48 || box.b > 500 - 48) throw new Error('feature graphic content too close to the edge: ' + JSON.stringify(box));
await page.screenshot({ path: OUT });
await browser.close();
console.log('wrote', path.relative(ROOT, OUT), 'content box', box);
