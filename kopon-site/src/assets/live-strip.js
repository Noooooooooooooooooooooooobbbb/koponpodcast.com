// The LIVE strip at the top of every page while Liverpool are playing:
// "● LIVE  Liverpool 1–0 Brighton  57'  Follow live →". It only checks for news around
// the kick-off times the site knows about, so normal visits never call the server.
import { parseKickoffs, inMatchWindow, pollSeconds, clockLabel } from './live-core.js';
import { esc } from './fans-ui.js';

const meta = document.querySelector('meta[name="kopon-kickoffs"]');
const kickoffs = parseKickoffs(meta?.content);
const header = document.querySelector('.site-header');
let strip = null, timer = null;

const store = { get(k) { try { return sessionStorage.getItem(k); } catch { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } } };
const ukTime = (iso) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }).format(new Date(iso));

function show(m) {
  const navLive = document.querySelector('.site-nav a[href="/live/"]');
  const on = m.state === 'in' || m.state === 'pre' || (m.state === 'post' && Date.now() - Date.parse(m.kickoff) < 3.5 * 3600000);
  navLive?.classList.toggle('is-live', m.state === 'in');
  if (!on || store.get(`kopon:strip:${m.id}:${m.state}`)) { strip?.remove(); strip = null; return; }
  const h = m.home.short || m.home.name, a = m.away.short || m.away.name;
  const text = m.postponed
    ? `<span class="ls-tag">${esc(m.detail || 'Postponed')}</span><span class="ls-match">${esc(h)} v ${esc(a)}</span>`
    : m.state === 'pre'
    ? `<span class="ls-tag">Today</span><span class="ls-match">${esc(h)} v ${esc(a)}</span><span class="ls-clock">${esc(ukTime(m.kickoff))}</span>`
    : `<span class="ls-tag${m.state === 'in' ? ' is-live' : ''}">${m.state === 'in' ? '<span class="lv-dot" aria-hidden="true"></span>Live' : 'Result'}</span><span class="ls-match">${esc(h)} <b>${m.home.score ?? 0}–${m.away.score ?? 0}</b> ${esc(a)}</span><span class="ls-clock">${esc(clockLabel(m))}</span>`;
  if (!strip) {
    strip = document.createElement('div');
    strip.className = 'live-strip';
    strip.setAttribute('role', 'region');
    strip.setAttribute('aria-label', 'Live match');
    header?.after(strip);
  }
  strip.innerHTML = `<div class="wrap ls-inner"><a class="ls-link" href="/live/">${text}<span class="ls-go">${m.state === 'post' ? 'Match centre' : 'Follow live'} →</span></a><button type="button" class="ls-close" aria-label="Hide this">×</button></div>`;
  strip.querySelector('.ls-close').addEventListener('click', () => { store.set(`kopon:strip:${m.id}:${m.state}`, '1'); strip.remove(); strip = null; });
}

let busy = false, last = 0;
async function check() {
  clearTimeout(timer);
  if (busy) return;
  busy = true; last = Date.now();
  try { await checkNow(); } finally { busy = false; }
}
async function checkNow() {
  if (!inMatchWindow(kickoffs)) { strip?.remove(); strip = null; timer = setTimeout(check, 5 * 60000); return; }
  let wait = 60;
  try {
    const r = await fetch('/api/live', { headers: { Accept: 'application/json' } });
    const m = r.ok ? await r.json() : null;
    if (m && m.home && m.state !== 'none' && m.state !== 'error') { show(m); wait = pollSeconds(m.state); }
    else if (m?.state === 'none') { strip?.remove(); strip = null; wait = 300; }
  } catch { wait = 90; }
  if (!document.hidden) timer = setTimeout(check, wait * 1000);
}

if (kickoffs.length && !document.getElementById('live-app')) {
  // coming back to the tab: check again, but not more than every 15 seconds
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else if (Date.now() - last > 15000) check(); else { clearTimeout(timer); timer = setTimeout(check, 15000); } });
  check();
}
