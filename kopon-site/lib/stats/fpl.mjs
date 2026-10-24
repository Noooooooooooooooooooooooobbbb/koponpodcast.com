// Team news from the Premier League's own Fantasy Premier League data (free, no key).
// Every Premier League player has a status that the Premier League keeps up to date:
//   i = injured, d = doubtful (with a 0/25/50/75% chance of playing), s = suspended,
//   u = unavailable (also used for players who have left or gone on loan), n = not eligible
//   (a loan player facing his parent club). The news line says what's wrong and when he's expected back.
// It covers every Premier League club, so Liverpool's list is right in every competition;
// opponents from outside the Premier League still come from ESPN and API-Football.
import { sameClub } from './clubs.mjs';

export const FPL_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const KEEP_DAYS = 3; // if FPL is down (it is while each gameweek is being updated), last good list for up to 3 days
const GONE = /\b(loan|joined|join|left the club|leaves the club|transferr?ed|permanent(ly)?|released|contract terminated|signed for|retired)\b/i;

const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();

// only what team news needs, so it's small enough to keep between builds
export function slimFpl(j) {
  if (!Array.isArray(j?.elements) || !Array.isArray(j?.teams) || j.teams.length < 18) throw new Error('unexpected answer from Fantasy Premier League');
  const teams = j.teams.map((t) => ({ id: t.id, name: t.name, short: t.short_name }));
  const list = j.elements
    .filter((e) => e.status && e.status !== 'a')
    .map((e) => ({ team: e.team, first: e.first_name || '', second: e.second_name || '', web: e.web_name || '', status: e.status, news: String(e.news || '').trim(), chance: e.chance_of_playing_next_round ?? null, added: e.news_added || null }));
  return { teams, list, players: j.elements.length };
}

export async function fetchFpl(fetchImpl, { cache = {}, now = new Date(), signal = null } = {}) {
  try {
    const ctrl = new AbortController();
    const stop = () => ctrl.abort();
    signal?.addEventListener?.('abort', stop);
    const t = setTimeout(stop, 20000);
    let r;
    try { r = await fetchImpl(FPL_URL, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal }); } finally { clearTimeout(t); signal?.removeEventListener?.('abort', stop); }
    const text = await r.text();
    if (/being updated/i.test(text.slice(0, 2000)) && !/^\s*\{/.test(text)) throw new Error('the game is being updated');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    let j; try { j = JSON.parse(text); } catch { throw new Error('not JSON'); }
    const fpl = { ...slimFpl(j), t: now.toISOString() };
    cache.fpl = fpl;
    return { fpl, fresh: true };
  } catch (err) {
    const old = cache.fpl;
    if (old?.t && now - new Date(old.t) < KEEP_DAYS * 86400000 && Array.isArray(old.list)) return { fpl: old, fresh: false, error: err.message };
    return { fpl: null, fresh: false, error: err.message };
  }
}

export function fplTeamOf(fpl, club) {
  if (!fpl) return null;
  const names = [club?.name, club?.shortName, club?.displayName].filter(Boolean);
  return fpl.teams.find((t) => names.some((n) => sameClub(n, t.name))) || null;
}

// the name the rest of the site uses for this player (ESPN's), else FPL's full name
export function nameFor(p, known = []) {
  const toks = new Set(fold(`${p.first} ${p.second} ${p.web}`).split(' ').filter(Boolean));
  const hit = known.find((k) => {
    const w = fold(k).split(' ').filter(Boolean); if (!w.length) return false;
    const last = w[w.length - 1];
    if (!toks.has(last)) return false;
    return w.length === 1 || toks.has(w[0]) || fold(p.web) === fold(k);
  });
  if (hit) return hit;
  const full = `${p.first} ${p.second}`.trim();
  return full || p.web;
}

const DAY_FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });

/**
 * Who's missing or doubtful for one club, from FPL.
 * league: the competition of the match. Suspensions and "not eligible" only apply to the Premier League.
 * known: player names from ESPN, so the same person is called the same thing everywhere on the site.
 */
export function fplOut(fpl, club, { league = 'Premier League', known = [] } = {}) {
  const t = fplTeamOf(fpl, club);
  if (!t) return null;
  const pl = /premier league/i.test(league || '');
  const out = [];
  for (const p of fpl.list) {
    if (p.team !== t.id) continue;
    let why;
    if (p.status === 'i') why = 'Out';
    else if (p.status === 'd') why = p.chance === 0 ? 'Out' : 'Doubtful';
    else if (p.status === 's') { if (!pl) continue; why = 'Suspended'; }
    else if (p.status === 'n') { if (!pl) continue; why = 'Not eligible'; }
    else if (p.status === 'u') { if (!p.news || GONE.test(p.news)) continue; why = /susp|ban/i.test(p.news) ? (pl ? 'Suspended' : null) : 'Unavailable'; if (!why) continue; }
    else continue;
    // FPL's own line, e.g. "Achilles injury - Expected back 02 Jan" or "Knee injury - 25% chance of playing"
    // (the chance is shown on its own, so it isn't repeated here)
    const detail = p.status === 'd' && p.chance != null ? p.news.replace(/\s*-\s*\d+% chance of playing\s*$/i, '').trim() : p.news;
    out.push({ name: nameFor(p, known), why, detail, chance: p.status === 'd' ? p.chance : null, since: p.added ? DAY_FMT.format(new Date(p.added)) : '' });
  }
  const rank = { Out: 0, Suspended: 1, 'Not eligible': 2, Unavailable: 3, Doubtful: 4 };
  out.sort((a, b) => rank[a.why] - rank[b.why] || (a.chance ?? 0) - (b.chance ?? 0) || a.name.localeCompare(b.name));
  return out;
}
