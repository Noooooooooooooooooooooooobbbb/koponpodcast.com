// The live match centre's rules, shared by the page, the LIVE strip and the tests:
// how each moment is described (in our own words), and how often to check for news.
import { esc } from './fans-ui.js';

const nameOf = (m, side) => (side === 'home' ? m.home : side === 'away' ? m.away : null);
const teamName = (m, side) => nameOf(m, side)?.short || nameOf(m, side)?.name || '';
const scoreLine = (m, sc) => (sc ? `${teamName(m, 'home')} ${sc[0]}–${sc[1]} ${teamName(m, 'away')}` : '');

/** One moment of the match as text: { title, text } (plain text; escape before use in HTML) */
export function describe(e, m) {
  const t = teamName(m, e.team);
  const who = (p) => (p ? `${p}${t ? ` (${t})` : ''}` : t);
  switch (e.kind) {
    case 'goal': return { title: 'GOAL!', text: `${who(e.player)}${e.assist ? `, set up by ${e.assist}` : ''}.${e.score ? ` ${scoreLine(m, e.score)}` : ''}` };
    case 'pen-goal': return { title: 'GOAL! Penalty', text: `${who(e.player)} scores from the spot.${e.score ? ` ${scoreLine(m, e.score)}` : ''}` };
    case 'own-goal': return { title: 'Own goal', text: `${who(e.player)} puts it into his own net.${e.score ? ` ${scoreLine(m, e.score)}` : ''}` };
    case 'pen-miss': return { title: 'Penalty missed', text: `${who(e.player)} fails to score from the spot.` };
    case 'yellow': return { title: 'Yellow card', text: who(e.player) };
    case 'second-yellow': return { title: 'Sent off', text: `${who(e.player)}: second yellow card.` };
    case 'red': return { title: 'Red card', text: `${who(e.player)} is sent off.` };
    case 'sub': return { title: `Substitution${t ? `, ${t}` : ''}`, text: `${e.on || '?'} comes on for ${e.off || '?'}.` };
    case 'var': return { title: 'VAR', text: e.note ? `${e.note[0].toUpperCase()}${e.note.slice(1)}.` : 'Check under way.' };
    case 'kickoff': return { title: 'Kick-off', text: "We're under way." };
    case 'ht': return { title: 'Half-time', text: e.score ? scoreLine(m, e.score) : 'The players head in at the break.' };
    case '2h': return { title: 'Second half', text: "The second half is under way." };
    case 'et': return { title: 'Extra time', text: 'Extra time is under way.' };
    case 'shootout': return { title: 'Penalties', text: "It's going to a penalty shoot-out." };
    case 'so-goal': return { title: 'Shoot-out', text: `${who(e.player)} scores.` };
    case 'so-miss': return { title: 'Shoot-out', text: `${who(e.player)} misses.` };
    case 'end': return m.state === 'post' ? { title: 'Full time', text: scoreLine(m, [m.home.score ?? 0, m.away.score ?? 0]) } : { title: 'End of normal time', text: scoreLine(m, [m.home.score ?? 0, m.away.score ?? 0]) };
    default: return { title: '', text: '' };
  }
}

// The score at half-time, worked out from the goals before it (for the half-time line)
export function withHalfTimeScore(m) {
  let last = [0, 0];
  for (const e of m.events || []) {
    if (e.score) last = e.score;
    if (e.kind === 'ht') e.score = last;
  }
  return m;
}

export const ICON = { goal: '⚽', 'pen-goal': '⚽', 'own-goal': '⚽', 'pen-miss': '✕', yellow: '', 'second-yellow': '', red: '', sub: '⇄', var: 'VAR', kickoff: '▶', ht: 'HT', '2h': '▶', et: 'ET', shootout: 'P', 'so-goal': '●', 'so-miss': '○', end: 'FT' };

/** The action feed, newest first, as HTML. `ours` is the Liverpool side ('home'/'away'). */
export function feedHtml(m, { ours = 'home', fresh = new Set() } = {}) {
  const list = [...(m.events || [])].reverse();
  if (!list.length) return `<p class="fine">${m.state === 'pre' ? 'The action will appear here from kick-off.' : 'Nothing to report yet.'}</p>`;
  return `<ol class="lv-feed">${list.map((e) => {
    const d = describe(e, m);
    if (!d.title) return '';
    const mark = ['yellow', 'second-yellow', 'red'].includes(e.kind) ? `<span class="lv-card lv-card-${e.kind === 'yellow' ? 'y' : 'r'}" aria-hidden="true"></span>` : `<span class="lv-ico" aria-hidden="true">${esc(ICON[e.kind] || '•')}</span>`;
    const big = ['goal', 'pen-goal', 'own-goal'].includes(e.kind);
    const usSide = e.kind === 'own-goal' ? e.for : e.team;
    return `<li class="lv-ev lv-${esc(e.kind)}${big ? ' lv-big' : ''}${usSide && usSide === ours ? ' lv-ours' : ''}${fresh.has(e.id) ? ' is-new' : ''}" data-id="${esc(e.id)}"><span class="lv-min">${esc(e.min || '')}</span>${mark}<div class="lv-txt"><strong>${esc(d.title)}</strong> ${esc(d.text)}</div></li>`;
  }).join('')}</ol>`;
}

/** Seconds until the next check, by what's happening */
export function pollSeconds(state) {
  return state === 'in' ? 30 : state === 'pre' ? 60 : state === 'post' ? 120 : state === 'error' ? 45 : 300;
}

// Kick-off times the site knew about when it was built: "2026-11-08T17:30Z" or "d:2026-11-04" (time not fixed yet)
export function parseKickoffs(text) {
  return String(text || '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => (s.startsWith('d:') ? { day: s.slice(2) } : { t: Date.parse(s) })).filter((k) => k.day || Number.isFinite(k.t));
}

/** Is a match on (or close) right now, so the LIVE strip should check? */
export function inMatchWindow(kickoffs, now = Date.now()) {
  const ukDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  return kickoffs.some((k) => (k.t ? now >= k.t - 75 * 60000 && now <= k.t + 4 * 3600000 : k.day === ukDay));
}

// "57'", "HT", "FT", or the kick-off time
export function clockLabel(m) {
  if (m.state === 'in') return m.halftime || /^HT$/i.test(m.detail) ? 'HT' : (m.detail || m.clock || 'LIVE').replace(/'\+(\d+)'/, "+$1'");
  if (m.state === 'post') return m.postponed ? m.detail || 'Off' : 'FT';
  return '';
}
