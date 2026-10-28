#!/usr/bin/env node
// Checks every limited field in docs/store-listing.md is within its store's
// character limit. A field is a heading "### <name> - <count>/<limit>"
// followed by a ```text block. `--fix` rewrites the counts to the real ones.
// Apple keywords are also checked: comma separated, no spaces after commas,
// no word that is already in the Apple name.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FILE = path.join(ROOT, 'docs', 'store-listing.md');
const fix = process.argv.includes('--fix');
let md = readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n');

const re = /^### (.+?) — (\d+|\?)\/(\d+)( characters)?\n\n```text\n([\s\S]*?)\n```/gm;
const fields = {};
let bad = 0, n = 0;
md = md.replace(re, (all, name, stated, limit, _c, body) => {
  n++;
  const len = [...body].length;              // characters, not bytes
  fields[name] = body;
  const ok = len <= +limit;
  const match = String(len) === stated;
  if (!ok) bad++;
  if (!match && !fix) bad++;
  console.log(`${ok ? 'ok  ' : 'OVER'} ${String(len).padStart(4)}/${limit}  ${name}${match ? '' : `  (heading says ${stated})`}`);
  return all.replace(`— ${stated}/${limit}`, `— ${len}/${limit}`);
});

const kw = fields['Apple keywords'];
if (kw !== undefined) {
  if (/,\s/.test(kw) || /\s,/.test(kw)) { console.log('FAIL Apple keywords: space next to a comma'); bad++; }
  const nameWords = (fields['Apple name'] || '').toLowerCase().split(/\W+/).filter(Boolean);
  const dupes = kw.toLowerCase().split(',').filter(k => nameWords.includes(k.trim()));
  if (dupes.length) { console.log(`FAIL Apple keywords repeat the name: ${dupes.join(', ')}`); bad++; }
}
for (const [name, body] of Object.entries(fields)) {
  if (/review/i.test(name)) continue;         // reviewer notes are private, and hold [PLACEHOLDERS]
  if (/\b(#1|best|number one)\b/i.test(body) || /\b[A-Z]{5,}\b/.test(body)) { console.log(`FAIL ${name}: ALL CAPS or a "best"/"#1" claim`); bad++; }
}

if (fix) writeFileSync(FILE, md);
console.log(`${n} fields checked, ${bad ? bad + ' problem(s)' : 'all within their limits'}`);
process.exit(bad ? 1 : 0);
