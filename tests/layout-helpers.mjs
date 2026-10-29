// In-page helpers shared by layout.spec.mjs and appearance.spec.mjs (moved
// here in 4.3, unchanged). Each runs inside the page, so each is self-contained.
// A realistic mid-afternoon: a tardy, an early leaver, an absence, two out, flags.
export function seed({ names, status }) {
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
export function fakeHistory() {
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
export function problems() {
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
