// The live match centre's rules, shared by the page, the LIVE strip and the tests:
// how each moment is described (in our own words), and how often to check for news.
import { esc } from './fans-ui.js';

const nameOf = (m, side) => (side === 'home' ? m.home : side === 'away' ? m.away : null);
const teamName = (m, side) => nameOf(m, side)?.short || nameOf(m, side)?.name || '';
const scoreLine = (m, sc) => (sc ? `${teamName(m, 'home')} ${sc[0]}–${sc[1]} ${teamName(m, 'away')}` : '');

/** One moment of the match as text: { title, text } (plain text; escape before use in HTML) */
export function describe(e, m) {
  // an own goal is listed under the side that benefits: the player is from the other side
  const other = (s) => (s === 'home' ? 'away' : s === 'away' ? 'home' : null);
  const side = e.kind === 'own-goal' ? (e.for ? other(e.for) : other(e.team)) : e.team;
  const t = teamName(m, side);
  const who = (p) => (p ? `${p}${t ? ` (${t})` : ''}` : t);
  const pensLine = () => {
    if (!m.pens) return '';
    const [h, a] = m.pens, win = h > a ? 'home' : a > h ? 'away' : null;
    return win ? ` ${teamName(m, win)} win ${Math.max(h, a)}–${Math.min(h, a)} on penalties.` : '';
  };
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
    case '2h': return { title: 'Second half', text: 'The second half is under way.' };
    case 'et': return { title: 'Extra time', text: 'Extra time is under way.' };
    case 'et-ht': return { title: 'Extra-time break', text: e.score ? scoreLine(m, e.score) : 'A short break before the second half of extra time.' };
    case 'et-2h': return { title: 'Extra time', text: 'The second half of extra time is under way.' };
    case 'shootout': return { title: 'Penalties', text: "It's going to a penalty shoot-out." };
    case 'end-90': return e.final ? { title: 'Full time', text: scoreLine(m, e.score || [m.home.score ?? 0, m.away.score ?? 0]) } : { title: 'End of normal time', text: e.score ? scoreLine(m, e.score) : '' };
    case 'end-et': return e.final ? { title: 'Full time, after extra time', text: scoreLine(m, e.score || [m.home.score ?? 0, m.away.score ?? 0]) } : { title: 'End of extra time', text: e.score ? scoreLine(m, e.score) : '' };
    case 'so-goal': return { title: 'Shoot-out', text: `${who(e.player)} scores.` };
    case 'so-miss': return { title: 'Shoot-out', text: `${who(e.player)} misses.` };
    case 'end': return { title: m.pens ? 'Full time, after penalties' : 'Full time', text: `${scoreLine(m, e.score || [m.home.score ?? 0, m.away.score ?? 0])}.${pensLine()}`.replace(/\.\./, '.') };
    default: return { title: '', text: '' };
  }
}

const PHASES = ['ht', 'et-ht', 'end-90', 'end-et', 'end'];
const ENDS = ['end-90', 'end-et', 'end'];
// The score at each break and whistle, worked out from the goals before it, and which whistle
// was the final one (normal time, extra time or after penalties)
export function withHalfTimeScore(m) {
  let last = [0, 0];
  const goalsKnown = (m.events || []).some((e) => e.score) || !(m.events || []).some((e) => ['goal', 'pen-goal', 'own-goal'].includes(e.kind));
  for (const e of m.events || []) {
    if (['goal', 'pen-goal', 'own-goal'].includes(e.kind) && e.score) last = e.score;
    if (PHASES.includes(e.kind)) { delete e.final; if (goalsKnown) e.score = last; }
  }
  if (m.state === 'post') { const lastEnd = [...(m.events || [])].reverse().find((e) => ENDS.includes(e.kind)); if (lastEnd) lastEnd.final = true; }
  return m;
}

export const ICON = { goal: '⚽', 'pen-goal': '⚽', 'own-goal': '⚽', 'pen-miss': '✕', yellow: '', 'second-yellow': '', red: '', sub: '⇄', var: 'VAR', kickoff: '▶', ht: 'HT', '2h': '▶', et: 'ET', shootout: 'P', 'so-goal': '●', 'so-miss': '○', 'et-ht': 'ET', 'et-2h': 'ET', 'end-90': 'FT', 'end-et': 'FT', end: 'FT' };

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
  if (m.state === 'in') {
    if (m.etBreak) return 'ET HT';
    return m.halftime || /^HT$/i.test(m.detail) ? 'HT' : (m.detail || m.clock || 'LIVE').replace(/'\+(\d+)'/, "+$1'");
  }
  if (m.state === 'post') {
    if (m.postponed) return m.detail || 'Off';
    if (/pen/i.test(m.detail || '') || m.pens) return 'Pens';
    if (/aet|extra/i.test(m.detail || '')) return 'AET';
    return 'FT';
  }
  return '';
}
// The clock in words, for the scoreboard
export function clockWords(m) {
  const c = clockLabel(m);
  return { HT: 'Half-time', 'ET HT': 'Extra-time break', FT: 'Full time', AET: 'After extra time', Pens: 'After penalties' }[c] || c;
}
