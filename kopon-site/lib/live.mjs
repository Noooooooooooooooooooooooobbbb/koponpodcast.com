// Live match centre: finds Liverpool's match that's on now (or about to start, or just
// finished) on ESPN and turns ESPN's match data into a small, tidy summary for the page.
//
// Only facts are used (score, clock, who scored, cards, substitutions, stats, line-ups);
// the action feed is written in the site's own words by the browser, not copied from
// ESPN's commentary.
import * as E from './stats/espn.mjs';
import { orderForFormation } from './fans/build.mjs';

const MIN = 60000;
export const WINDOW = { before: 75 * MIN, after: 4 * 60 * MIN }; // show the match from 75 min before kick-off to 4 h after

// "English Premier League" → "Premier League" (as on the rest of the site)
export const compName = (c) => String(c || '').replace(/^(English|UEFA|Spanish)\s+/i, '').trim();

// "45'+2'" → "45+2'"
const minute = (clock) => String(clock?.displayValue || '').replace(/'\+(\d+)'/, '+$1\'').trim();
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

// What kind of moment a key event is (ESPN's own labels, sorted into a few kinds)
export function eventKind(k) {
  const t = `${k?.type?.type || ''} ${k?.type?.text || ''}`.toLowerCase();
  if (/start-delay|end-delay|\bdelay\b/.test(t)) return null; // injury stoppages: not shown
  // penalty shoot-out kicks are not goals in the match
  if (k?.shootout) return /(miss|saved|save)/.test(t) ? 'so-miss' : (k.scoringPlay || /scored|goal/.test(t)) ? 'so-goal' : null;
  if (/own.?goal/.test(t)) return 'own-goal';
  if (/penalty/.test(t) && /(miss|saved|save)/.test(t)) return 'pen-miss';
  if (k?.scoringPlay || /\bgoal\b/.test(t)) {
    if (/disallow|cancel|ruled out/.test(t)) return 'var';
    return /penalty/.test(t) ? 'pen-goal' : 'goal';
  }
  if (/second.?yellow|yellow.?red/.test(t)) return 'second-yellow';
  if (/red.?card/.test(t)) return 'red';
  if (/yellow.?card/.test(t)) return 'yellow';
  if (/substitution/.test(t)) return 'sub';
  if (/\bvar\b/.test(t)) return 'var';
  if (/kickoff|kick-off/.test(t)) return 'kickoff';
  if (/halftime|half-time/.test(t)) return 'ht';
  if (/start.?2nd.?half|second half begins/.test(t)) return '2h';
  if (/start.?extra.?time|extra.?time.?(first|second)?.?half.?(begins|start)/.test(t)) return 'et';
  if (/shootout/.test(t)) return 'shootout';
  if (/end.?regular.?time|end.?extra.?time|full.?time|match.?ends|end-game/.test(t)) return 'end';
  return null;
}

const shootout = (c) => num(c?.shootoutScore ?? c?.shootOutScore);
const teamOf = (c) => ({
  id: String(c?.team?.id ?? ''), name: c?.team?.displayName || c?.team?.name || '', short: c?.team?.shortDisplayName || c?.team?.displayName || '',
  abbr: c?.team?.abbreviation || '', logo: c?.team?.logos?.[0]?.href || c?.team?.logo || '', score: num(typeof c?.score === 'object' ? c?.score?.value ?? c?.score?.displayValue : c?.score),
});

const STAT_ROWS = [
  ['possessionPct', 'Possession', '%'], ['totalShots', 'Shots'], ['shotsOnTarget', 'Shots on target'], ['wonCorners', 'Corners'],
  ['passPct', 'Pass accuracy', '%'], ['totalPasses', 'Passes'], ['saves', 'Saves'], ['foulsCommitted', 'Fouls'], ['offsides', 'Offsides'],
  ['yellowCards', 'Yellow cards'], ['redCards', 'Red cards'], ['totalTackles', 'Tackles'], ['interceptions', 'Interceptions'],
];

export function matchStats(sum, homeId, awayId) {
  const teams = sum?.boxscore?.teams || [];
  const of = (id) => {
    const t = teams.find((x) => String(x.team?.id ?? '') === String(id));
    const m = Object.fromEntries((t?.statistics || []).map((s) => [s.name, num(s.displayValue ?? s.value)]));
    // ESPN gives pass accuracy as 0.8; work it out properly from the passes
    if (m.totalPasses) m.passPct = Math.round((100 * (m.accuratePasses || 0)) / m.totalPasses);
    else if (m.passPct != null && m.passPct <= 1) m.passPct = Math.round(m.passPct * 100);
    if (m.possessionPct != null) m.possessionPct = Math.round(m.possessionPct);
    return m;
  };
  const h = of(homeId), a = of(awayId);
  return STAT_ROWS.filter(([k]) => h[k] != null && a[k] != null).map(([key, label, unit = '']) => ({ key, label, unit, home: h[key], away: a[key] }))
    // before kick-off everything is 0: nothing worth showing
    .filter((r, _, all) => all.some((x) => x.home || x.away));
}

// Line-ups: starting XI in formation order, substitutes, who came on/off when, and cards
export function lineups(sum, side, events) {
  const r = (sum?.rosters || []).find((x) => String(x.team?.id ?? '') === String(side.id)) || (sum?.rosters || []).find((x) => x.homeAway === side.ha);
  if (!r) return null;
  const list = (r.roster || []).filter((p) => p.athlete?.displayName);
  const mine = events.filter((e) => e.team === side.ha);
  const marks = (name) => {
    const m = {};
    for (const e of mine) {
      if (['goal', 'pen-goal'].includes(e.kind) && e.player === name) (m.goals ||= []).push(e.min);
      if (e.kind === 'own-goal' && e.player === name) (m.ownGoals ||= []).push(e.min);
      if (e.kind === 'yellow' && e.player === name) m.yellow = e.min;
      if ((e.kind === 'red' || e.kind === 'second-yellow') && e.player === name) m.red = e.min;
      if (e.kind === 'sub' && e.off === name) m.off = e.min;
      if (e.kind === 'sub' && e.on === name) m.on = e.min;
    }
    // own goals are credited to the other side in ESPN's events
    for (const e of events) if (e.kind === 'own-goal' && e.team !== side.ha && e.player === name) (m.ownGoals ||= []).push(e.min);
    return m;
  };
  const one = (p) => ({ name: p.athlete.displayName, aid: String(p.athlete.id ?? ''), num: String(p.jersey ?? ''), pos: String(p.position?.abbreviation || '').toUpperCase(), place: +p.formationPlace || 0, ...marks(p.athlete.displayName) });
  const formation = /^\d(-\d){2,4}$/.test(r.formation || '') ? r.formation : '';
  const sorted = list.filter((p) => p.starter).map(one).sort((a, b) => (a.place || 99) - (b.place || 99));
  if (!sorted.length) return null;
  // in the same order as the site's pitch positions for that formation (keeper first)
  const xi = sorted.length === 11 ? orderForFormation(sorted, formation || '4-3-3') : sorted;
  const subs = list.filter((p) => !p.starter).map(one).sort((a, b) => (a.on ? 0 : 1) - (b.on ? 0 : 1) || (+a.num || 99) - (+b.num || 99));
  return { formation, xi, subs };
}

/** ESPN's match summary → what the live page shows */
export function liveSummary(sum, ev = {}) {
  const comp = sum?.header?.competitions?.[0] || {};
  const cs = comp.competitors || [];
  const H = cs.find((c) => c.homeAway === 'home') || cs[0], A = cs.find((c) => c.homeAway === 'away') || cs[1];
  const home = { ...teamOf(H), ha: 'home' }, away = { ...teamOf(A), ha: 'away' };
  const st = comp.status?.type || {};
  const state = st.state || 'pre';
  const sideOf = (k) => (String(k.team?.id ?? '') === home.id ? 'home' : String(k.team?.id ?? '') === away.id ? 'away' : null);

  const events = [];
  for (const k of sum?.keyEvents || []) {
    const kind = eventKind(k);
    if (!kind) continue;
    const ps = (k.participants || []).map((p) => p.athlete?.displayName).filter(Boolean);
    const e = { id: String(k.id ?? `${kind}-${events.length}`), kind, min: minute(k.clock), period: k.period?.number || null, team: sideOf(k) };
    if (['goal', 'pen-goal', 'own-goal', 'pen-miss', 'yellow', 'second-yellow', 'red', 'so-goal', 'so-miss'].includes(kind)) e.player = ps[0] || '';
    if (kind === 'goal' && ps[1]) e.assist = ps[1];
    if (kind === 'sub') { e.on = ps[0] || ''; e.off = ps[1] || ''; }
    if (kind === 'var') e.note = String(k.type?.text || '').replace(/^var\s*[-–:]\s*/i, '');
    events.push(e);
  }
  // the score after each goal (only if it adds up to the real score). ESPN may list an own goal
  // under either team, so both readings are tried.
  const tally = (ogForTeam) => {
    let h = 0, a = 0;
    const marks = [];
    for (const e of events) {
      if (!['goal', 'pen-goal', 'own-goal'].includes(e.kind) || !e.team) continue;
      const scorer = e.kind === 'own-goal' && !ogForTeam ? (e.team === 'home' ? 'away' : 'home') : e.team;
      if (scorer === 'home') h++; else a++;
      marks.push([e, [h, a], scorer]);
    }
    return { h, a, marks };
  };
  const scoreKnown = home.score != null && away.score != null;
  const fits = [tally(true), tally(false)].find((x) => !scoreKnown || (x.h === home.score && x.a === away.score));
  if (fits) for (const [e, sc, scorer] of fits.marks) { e.score = sc; e.for = scorer; }
  if (!scoreKnown && state !== 'pre') { home.score = fits.h; away.score = fits.a; }

  const status = comp.status || {};
  return {
    id: String(ev.id || sum?.header?.id || ''), comp: compName(ev.league || sum?.header?.league?.name || ''), kickoff: comp.date || ev.date || '',
    state, // pre | in | post
    detail: st.shortDetail || st.detail || '', // "34'", "HT", "FT", "Postponed"
    clock: status.displayClock || '', period: status.period || null,
    halftime: /half.?time/i.test(`${st.name || ''} ${st.description || ''}`),
    postponed: /postpon|cancel|abandon|suspend/i.test(`${st.name || ''} ${st.description || ''}`),
    venue: sum?.gameInfo?.venue?.fullName || ev.venue || '',
    home, away, events,
    pens: shootout(H) != null && shootout(A) != null && (shootout(H) || shootout(A)) ? [shootout(H), shootout(A)] : null,
    stats: matchStats(sum, home.id, away.id),
    lineups: { home: lineups(sum, home, events), away: lineups(sum, away, events) },
  };
}

// Which match to show: one in progress, else the nearest within 75 min before kick-off to 4 h after
export function pickMatch(fx, now = new Date()) {
  const t = now.getTime();
  if (fx.live?.length) return fx.live[0];
  const all = [...(fx.upcoming || []), ...(fx.past || [])].filter((e) => !e.tbc && !e.postponed && Number.isFinite(Date.parse(e.date)));
  const near = all.filter((e) => { const k = Date.parse(e.date); return t >= k - WINDOW.before && t <= k + WINDOW.after; });
  near.sort((x, y) => Math.abs(Date.parse(x.date) - t) - Math.abs(Date.parse(y.date) - t));
  return near[0] || null;
}

const brief = (e) => e && { id: e.id, date: e.date, tbc: !!e.tbc, comp: compName(e.league), home: { name: e.home?.name, short: e.home?.shortName || e.home?.name, logo: e.home?.logo || '' }, away: { name: e.away?.name, short: e.away?.shortName || e.away?.name, logo: e.away?.logo || '' }, hs: e.hs ?? null, as: e.as ?? null };

// Remembered between requests while the function stays warm, so the schedule isn't looked up every time
let picked = null; // { ev, until }

/** Everything /api/live returns */
export async function liveNow({ fetchImpl = globalThis.fetch, teamId = '364', now = new Date(), signal = null, fresh = false } = {}) {
  const espn = E.espnClient(fetchImpl, { signal, timeoutMs: 8000 });
  let ev = !fresh && picked && picked.until > now.getTime() && picked.team === teamId ? picked.ev : null;
  let fx = null;
  if (!ev) {
    fx = await E.teamFixtures(espn, teamId, now);
    ev = pickMatch(fx, now);
    picked = ev ? { ev, team: teamId, until: now.getTime() + 10 * MIN } : null;
  }
  if (!ev) {
    return { state: 'none', next: brief(fx?.upcoming?.[0]), last: brief(fx?.past?.[0]), updated: now.toISOString() };
  }
  const sum = await E.summary(espn, ev);
  const out = liveSummary(sum, ev);
  out.updated = now.toISOString();
  // a finished match stops being "the" match after 4 hours
  if (out.state === 'post' && now.getTime() - Date.parse(ev.date) > WINDOW.after) picked = null;
  return out;
}

export function _resetLiveCache() { picked = null; }
