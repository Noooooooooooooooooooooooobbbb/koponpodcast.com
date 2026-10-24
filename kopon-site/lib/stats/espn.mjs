// ESPN's free public football data (no key). Ported from Flappy Jim
// (public/js/espn.js, lib/teamstats.js, lib/espndays.js) to run at build time.
export const API = 'https://site.api.espn.com/apis/site/v2/sports/soccer/';
export const STANDINGS_API = 'https://site.api.espn.com/apis/v2/sports/soccer/';

export function espnClient(fetchImpl, { timeoutMs = 12000, concurrency = 6, signal = null } = {}) {
  const memo = new Map();
  let active = 0;
  const queue = [];
  const slot = () => (active < concurrency ? (active++, Promise.resolve()) : new Promise((r) => queue.push(r)));
  const release = () => { active--; const next = queue.shift(); if (next) { active++; next(); } };
  const stats = { requests: 0, failures: 0 };
  async function get(url) {
    if (memo.has(url)) return memo.get(url);
    const p = (async () => {
      await slot();
      try {
        if (signal?.aborted) throw new Error('stopped: stats took too long');
        stats.requests++;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        const stop = () => ctrl.abort();
        signal?.addEventListener?.('abort', stop, { once: true });
        try {
          const r = await fetchImpl(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KopOnStats/1.0)', Accept: 'application/json' }, signal: ctrl.signal });
          if (!r.ok) throw new Error(`ESPN said ${r.status}`);
          return await r.json();
        } finally { clearTimeout(t); signal?.removeEventListener?.('abort', stop); }
      } catch (e) { stats.failures++; throw e; } finally { release(); }
    })();
    memo.set(url, p);
    p.catch(() => memo.delete(url));
    return p;
  }
  return { get, stats };
}

export const seasonOf = (d = new Date()) => (d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1);
export const seasonStart = (d = new Date()) => new Date(Date.UTC(seasonOf(d), 6, 15));
const ymd = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

const teamOf = (c) => ({
  id: String(c?.team?.id ?? c?.id ?? ''), name: c?.team?.displayName || c?.team?.name || '?', short: c?.team?.abbreviation || '',
  shortName: c?.team?.shortDisplayName || c?.team?.displayName || '', logo: c?.team?.logos?.[0]?.href || c?.team?.logo || '',
});
const scoreOf = (c) => { const s = c?.score; const v = s == null ? null : typeof s === 'object' ? (s.displayValue ?? s.value) : s; return v == null || v === '' ? null : +v; };

// One fixture, the same shape whichever ESPN feed it came from
export function normEvent(e, slug = '') {
  const c = e.competitions?.[0] || {}, cs = c.competitors || [];
  const H = cs.find((x) => x.homeAway === 'home') || cs[0], A = cs.find((x) => x.homeAway === 'away') || cs[1];
  const st = c.status?.type || e.status?.type || {};
  return {
    id: String(e.id), date: e.date, name: e.name || '',
    league: String(e.league?.name || e.season?.displayName || c.league?.name || '').replace(/^\d{4}(?:[-/]\d{2,4})?\s+/, ''),
    slug: e.league?.slug || c.league?.slug || slug || 'all',
    home: teamOf(H), away: teamOf(A), hs: scoreOf(H), as: scoreOf(A),
    state: st.state || (st.completed ? 'post' : 'pre'), done: !!st.completed, detail: st.shortDetail || st.detail || '',
    // kick-off time not fixed yet (e.g. waiting on TV picks)
    tbc: c.timeValid === false || /TBD|TBA/i.test(`${st.name || ''} ${st.shortDetail || ''}`),
    postponed: /postpon|cancel|abandon|suspend/i.test(`${st.name || ''} ${st.description || ''} ${st.detail || ''}`),
    venue: c.venue?.fullName || '',
  };
}

// A team's results (newest first) and next fixtures, all competitions
export async function teamFixtures(espn, id, now = new Date()) {
  const s = seasonOf(now);
  const [cur, nxt] = await Promise.all([
    espn.get(`${API}all/teams/${id}/schedule?season=${s}`).catch(() => ({})),
    espn.get(`${API}all/teams/${id}/schedule?fixture=true`).catch(() => ({})),
  ]);
  // friendlies don't count towards anything on the Stats page
  const real = (e) => !isFriendly(e.league) && Number.isFinite(Date.parse(e.date));
  let past = (cur.events || []).map((e) => normEvent(e)).filter((e) => e.done && e.hs != null && e.as != null && real(e));
  if (past.length < 6) {
    const prev = await espn.get(`${API}all/teams/${id}/schedule?season=${s - 1}`).catch(() => ({}));
    past = past.concat((prev.events || []).map((e) => normEvent(e)).filter((e) => e.done && e.hs != null && e.as != null && real(e)));
  }
  const all = (nxt.events || []).concat(cur.events || []).map((e) => normEvent(e)).filter(real);
  const live = all.filter((e) => !e.done && e.state === 'in');
  const upcoming = all.filter((e) => !e.done && e.state !== 'in' && !e.postponed && Date.parse(e.date) > now.getTime() - 3 * 3600000);
  const seen = new Set();
  const uniq = (list) => list.filter((e) => !seen.has(e.id) && seen.add(e.id));
  past = uniq(past).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const up = uniq(upcoming).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  if (!past.length && !up.length) throw new Error(`ESPN had no fixtures for team ${id}`);
  return { past, upcoming: up, live: uniq(live), team: cur.team || nxt.team || null };
}

export const isFriendly = (league) => /friendl|pre-?season|club challenge|exhibition/i.test(String(league || ''));
export const summary = (espn, ev) => espn.get(`${API}${ev.slug && ev.slug !== 'all' ? ev.slug : 'all'}/summary?event=${ev.id}`)
  .catch(() => espn.get(`${API}all/summary?event=${ev.id}`));

// ---- form, head-to-head, season numbers (from Flappy Jim's preview code) ----------
function goalsFor(teamId, g) {
  if (g.homeTeamScore != null && g.awayTeamScore != null && g.homeTeamId != null) {
    const home = String(g.homeTeamId) === String(teamId), h = +g.homeTeamScore, a = +g.awayTeamScore;
    if (Number.isFinite(h) && Number.isFinite(a)) return home ? [h, a] : [a, h];
  }
  const m = String(g.score || '').match(/(\d+)\s*-\s*(\d+)/); return m ? [+m[1], +m[2]] : null;
}
function resultFor(teamId, g) {
  if (g.gameResult) return String(g.gameResult).toUpperCase()[0];
  const gs = goalsFor(teamId, g); if (!gs) return null;
  return gs[0] > gs[1] ? 'W' : gs[0] < gs[1] ? 'L' : 'D';
}

export function formFrom(fixtures, teamId, before = Date.now(), n = 5) {
  return fixtures.past.filter((e) => e.done && e.hs != null && Date.parse(e.date) < before).slice(0, n).map((e) => {
    const home = e.home.id === String(teamId), mine = home ? e.hs : e.as, theirs = home ? e.as : e.hs, opp = home ? e.away : e.home;
    return { r: mine > theirs ? 'W' : mine < theirs ? 'L' : 'D', gs: [mine, theirs], opp: opp.name, oppShort: opp.short, oppLogo: opp.logo, date: e.date, at: home ? 'H' : 'A', comp: e.league };
  });
}

export function headToHead(sum, homeId) {
  const out = [];
  for (const blk of (sum.headToHeadGames || []).slice(0, 1)) {
    const id = String(blk.team?.id ?? homeId), flip = id !== String(homeId);
    for (const g of blk.events || []) {
      let r = resultFor(id, g), gs = goalsFor(id, g);
      if (flip) { if (r) r = r === 'W' ? 'L' : r === 'L' ? 'W' : r; if (gs) gs = [gs[1], gs[0]]; }
      out.push({ date: g.gameDate, gs, r, comp: g.leagueName || g.leagueAbbreviation || '', homeGame: g.atVs ? g.atVs === 'vs' : null });
    }
  }
  return out.filter((g) => g.gs).slice(0, 6);
}

export function teamSeason(fixtures, teamId, now = new Date(), league = '') {
  const start = seasonStart(now);
  let games = fixtures.past.filter((e) => e.done && Date.parse(e.date) >= start.getTime() && e.hs != null);
  if (league) games = games.filter((e) => e.league === league);
  const s = { P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, cs: 0, fts: 0, home: { P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0 }, away: { P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0 }, form: [] };
  for (const e of games) {
    const home = e.home.id === String(teamId), gf = home ? e.hs : e.as, ga = home ? e.as : e.hs, r = gf > ga ? 'W' : gf < ga ? 'L' : 'D', v = home ? s.home : s.away;
    for (const o of [s, v]) { o.P++; o[r]++; o.GF += gf; o.GA += ga; }
    if (ga === 0) s.cs++; if (gf === 0) s.fts++;
    if (s.form.length < 5) s.form.push(r);
  }
  s.pts = s.W * 3 + s.D; s.ppg = s.P ? s.pts / s.P : 0;
  return s;
}

// ---- who can't play: injury lists from the match page and the squad page ----------
const foldName = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z .'-]/g, '').trim();
export function sameName(a, b) {
  const A = foldName(a).split(/[\s.]+/).filter(Boolean), B = foldName(b).split(/[\s.]+/).filter(Boolean);
  if (!A.length || !B.length) return false;
  if (A.join(' ') === B.join(' ')) return true;
  if (A[A.length - 1] !== B[B.length - 1]) return false;
  if (A.length === 1 || B.length === 1) return true; // just a surname
  // "D. Szoboszlai" = "Dominik Szoboszlai", but "Rhys Williams" ≠ "Rio Williams"
  if (A[0].length === 1 || B[0].length === 1) return A[0][0] === B[0][0];
  return A[0] === B[0];
}
const keepStatus = (st) => !/day-to-day|probable|available|active/i.test(st || '');

export async function unavailable(espn, team, ev, sum) {
  const out = [];
  const add = (name, why, detail = '') => { if (name && !out.some((o) => sameName(o.name, name))) out.push({ name, why, detail }); };
  for (const blk of sum?.injuries || []) {
    if (String(blk.team?.id ?? '') !== String(team.id)) continue;
    for (const i of blk.injuries || []) {
      const st = i.status || i.type?.description || '';
      if (keepStatus(st)) add(i.athlete?.displayName || i.athlete?.shortName, /susp/i.test(st) ? 'Suspended' : /question|doubt/i.test(st) ? 'Doubtful' : 'Out', i.details?.type || i.type?.description || '');
    }
  }
  const slug = ev?.slug && ev.slug !== 'all' ? ev.slug : null;
  if (slug) {
    const j = await espn.get(`${API}${slug}/teams/${team.id}/roster`).catch(() => null);
    const athletes = (j?.athletes || []).flatMap((a) => (Array.isArray(a.items) ? a.items : [a]));
    for (const a of athletes) {
      const inj = (a.injuries || [])[0];
      const st = inj?.status || inj?.type?.description || '';
      if (inj && keepStatus(st)) add(a.displayName || a.fullName, /susp/i.test(st) ? 'Suspended' : /question|doubt/i.test(st) ? 'Doubtful' : 'Out', inj.details?.type || '');
      if (/susp/i.test(a.status?.name || a.status?.type || '')) add(a.displayName || a.fullName, 'Suspended');
    }
  }
  return out;
}

// ---- standings (fallback when football-data.org isn't available) ------------------
export async function espnStandings(espn, slug) {
  const j = await espn.get(`${STANDINGS_API}${slug}/standings`);
  const groups = j.children?.length ? j.children : [j];
  const rows = [];
  for (const g of groups) {
    for (const en of g.standings?.entries || []) {
      const st = Object.fromEntries((en.stats || []).map((s) => [s.name || s.type, num(s.value ?? s.displayValue)]));
      rows.push({
        pos: st.rank || rows.length + 1, id: String(en.team?.id ?? ''), name: en.team?.shortDisplayName || en.team?.displayName || '?', full: en.team?.displayName || '',
        short: en.team?.abbreviation || '', logo: en.team?.logos?.[0]?.href || '',
        P: st.gamesPlayed ?? 0, W: st.wins ?? 0, D: st.ties ?? 0, L: st.losses ?? 0, GF: st.pointsFor ?? 0, GA: st.pointsAgainst ?? 0,
        GD: st.pointDifferential ?? ((st.pointsFor ?? 0) - (st.pointsAgainst ?? 0)), Pts: st.points ?? 0, form: '',
      });
    }
  }
  if (!rows.length) throw new Error('ESPN standings empty');
  return rows.sort((a, b) => a.pos - b.pos);
}

// ---- Flappy Jim xG: the chance a shot from that spot goes in --------------------
export function shotXg(t) {
  if (/penalty/i.test(t) && !/following a/.test(t.split(' from ')[1] || '')) return 0.76;
  const head = /header/i.test(t), from = (t.match(/ from (.*?)(?: is | to | misses|\.|,|$)/) || [])[1] || '';
  if (/direct free kick/i.test(t)) return 0.06;
  if (/very close range/i.test(from)) return head ? 0.35 : 0.5;
  if (/six yard box/i.test(from)) return /centre/.test(from) ? (head ? 0.3 : 0.45) : (head ? 0.15 : 0.22);
  if (/centre of the box/i.test(from)) return head ? 0.09 : 0.15;
  if (/side of the box/i.test(from)) return head ? 0.05 : 0.07;
  if (/difficult angle/i.test(from)) return 0.04;
  if (/more than 35 yards|long range/i.test(from)) return 0.015;
  if (/outside the box/i.test(from)) return 0.035;
  return 0.08;
}

const ALIAS = { 'man utd': 'manchester united', 'man united': 'manchester united', 'man city': 'manchester city', wolves: 'wolverhampton wanderers', 'nottm forest': 'nottingham forest', spurs: 'tottenham hotspur', psg: 'paris saint germain' };
const norm0 = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/'/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\butd\b/g, 'united').replace(/\b(fc|afc|cf|sc|ac|club|the)\b/g, ' ').replace(/\s+/g, ' ').trim();
const clubNorm = (x) => { let n = norm0(x); n = ALIAS[n] || n; return n.replace(/^(as|rb|sv|vfb|vfl|tsg|fk|cd|ud|rcd|ca|1|ss|us|ogc|rc|sk|bk|if|aik)\s+/, '').trim(); };
const SHARED = ['manchester', 'real', 'athletic', 'atletico', 'sporting', 'inter', 'sheffield', 'bristol', 'west', 'stade', 'racing', 'club', 'deportivo', 'union', 'borussia', 'dynamo', 'dinamo', 'red'];

function shotsFrom(sum, teams) {
  const blank = () => ({ sh: 0, shSp: 0, shOp: 0, shBox: 0, shCnt: 0, hd: 0, big: 0, g: 0, gSp: 0, gOp: 0, gPen: 0, xg: 0, xgSp: 0, xgOp: 0 });
  const out = teams.map(() => blank());
  const pick = (test) => { const hits = teams.map((t) => [].concat(t).some((x) => x && test(clubNorm(x)))); return hits[0] && !hits[1] ? 0 : hits[1] && !hits[0] ? 1 : -1; };
  const idx = (name) => { const n = clubNorm(name); let i = pick((x) => x === n); if (i >= 0) return i; const w = n.split(' ')[0]; if (w.length < 4 || SHARED.includes(w)) return -1; return pick((x) => x.split(' ')[0] === w); };
  let seen = 0;
  for (const c of sum.commentary || []) {
    const t = String(c.text || c.play?.text || '');
    if (!/^(Attempt|Goal!|Penalty)/.test(t)) continue;
    const m = t.match(/^(?:Attempt (?:missed|saved|blocked)|Goal!|Penalty (?:saved|missed)!?)[.!]?\s.*?\(([^)]+)\)/);
    if (!m) continue;
    const i = idx(m[1]); if (i < 0) continue;
    seen++;
    const o = out[i], xg = shotXg(t), goal = /^Goal!/.test(t), pen = /penalty/i.test(t) && !/following/.test(t);
    const sp = pen || /following a corner|following a set piece|set piece situation|direct free kick|free kick/i.test(t), cnt = /fast break/i.test(t);
    const box = /box|very close range|penalty/i.test(t) && !/outside the box/i.test(t);
    o.sh++; o.xg += xg; if (sp) { o.shSp++; o.xgSp += xg; } else { o.shOp++; o.xgOp += xg; }
    if (box) o.shBox++; if (cnt) o.shCnt++; if (/header/i.test(t)) o.hd++; if (xg >= 0.3) o.big++;
    if (goal) { o.g++; if (pen) o.gPen++; if (sp) o.gSp++; else o.gOp++; }
  }
  return seen ? out : null;
}
const shotsOk = (x) => !!(x && x.c && x.s && x.s.totalShots != null && !(x.c.sh === 0 && x.s.totalShots > 0) && !(x.s.totalShots >= 3 && x.c.sh < x.s.totalShots * 0.6));

// One finished match → each team's numbers (compact, so they can be remembered between builds)
export function compactMatch(sum) {
  const teams = sum?.boxscore?.teams || [];
  if (teams.length !== 2) return null;
  const comp = sum.header?.competitions?.[0] || {};
  const score = {}; for (const c of comp.competitors || []) score[String(c.id ?? c.team?.id)] = num(c.score?.value ?? c.score);
  const shots = shotsFrom(sum, teams.map((t) => [t.team?.displayName, t.team?.shortDisplayName, t.team?.name, t.team?.location].filter(Boolean)));
  return teams.map((t, k) => {
    const id = String(t.team?.id ?? ''), s = {};
    for (const x of t.statistics || []) { const v = num(x.value ?? x.displayValue); if (v != null) s[x.name] = v; }
    return { id, name: t.team?.displayName || t.team?.name || '?', short: t.team?.abbreviation || '', logo: t.team?.logo || t.team?.logos?.[0]?.href || '', goals: score[id] ?? null, s, c: shots ? shots[k] : null };
  });
}

const C = (k) => (m) => (m.c ? m.c[k] : null), CA = (k) => (m, o) => (o.c ? o.c[k] : null);
// [key, label, per-match value, higher is better (1) or worse (-1), unit, group]
export const METRICS = [
  ['goals', 'Goals scored', (m) => m.goals, 1, 'pg', 'Attack'],
  ['xg', 'xG (expected goals)', (m) => m.s.expectedGoals ?? m.s.xG ?? m.c?.xg ?? null, 1, 'pg', 'Attack'],
  ['shots', 'Shots', (m) => m.s.totalShots, 1, 'pg', 'Attack'],
  ['sot', 'Shots on target', (m) => m.s.shotsOnTarget, 1, 'pg', 'Attack'],
  ['big', 'Big chances', C('big'), 1, 'pg', 'Attack'],
  ['xgShot', 'Chance quality (xG per shot)', null, 1, 'num', 'Attack'],
  ['boxPct', 'Shots from inside the box', null, 1, 'pct', 'Attack'],
  ['finish', 'Finishing (goals minus xG)', null, 1, 'tot', 'Attack'],
  ['xgSp', 'Set-piece xG', C('xgSp'), 1, 'pg', 'Attack'],
  ['conceded', 'Goals conceded', (m, o) => o.goals, -1, 'pg', 'Defence'],
  ['xga', 'xG against', (m, o) => o.s.expectedGoals ?? o.s.xG ?? o.c?.xg ?? null, -1, 'pg', 'Defence'],
  ['shotsAg', 'Shots faced', (m, o) => o.s.totalShots, -1, 'pg', 'Defence'],
  ['bigA', 'Big chances conceded', CA('big'), -1, 'pg', 'Defence'],
  ['xgSpA', 'Set-piece xG against', CA('xgSp'), -1, 'pg', 'Defence'],
  ['tackles', 'Tackles', (m) => m.s.totalTackles, 1, 'pg', 'Defence'],
  ['ints', 'Interceptions', (m) => m.s.interceptions, 1, 'pg', 'Defence'],
  ['ppda', 'Pressing (PPDA)', null, -1, 'num', 'Style'],
  ['poss', 'Possession', (m) => m.s.possessionPct, 1, 'pct', 'Style'],
  ['passes', 'Passes', (m) => m.s.totalPasses, 1, 'pg', 'Style'],
  ['passPct', 'Pass accuracy', null, 1, 'pct', 'Style'],
  ['crosses', 'Crosses', (m) => m.s.totalCrosses, 1, 'pg', 'Style'],
  ['longBalls', 'Long balls', (m) => m.s.totalLongBalls, 1, 'pg', 'Style'],
  ['corners', 'Corners won', (m) => m.s.wonCorners, 1, 'pg', 'Style'],
  ['fouls', 'Fouls', (m) => m.s.foulsCommitted, -1, 'pg', 'Discipline'],
  ['yellows', 'Yellow cards', (m) => m.s.yellowCards, -1, 'pg', 'Discipline'],
];

// League-wide team numbers and ranks, from every finished match's stats.
// `cache` is { ev: { id: compact } } and is extended in place (kept between builds).
export async function leagueTeamStats(espn, slug, cache, { now = new Date(), maxNew = 150 } = {}) {
  cache.ev ||= {};
  const from = seasonStart(now), to = new Date(now.getTime() + 86400000);
  // ESPN answers one day at a time; its calendar says which days have matches
  const today = await espn.get(`${API}${slug}/scoreboard?dates=${ymd(now)}`).catch(() => ({}));
  const cal = new Set();
  const walk = (v) => { if (!v) return; if (typeof v === 'string') { const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) cal.add(m[1] + m[2] + m[3]); } else if (Array.isArray(v)) v.forEach(walk); else if (typeof v === 'object') { walk(v.startDate); walk(v.date); walk(v.entries); } };
  walk(today?.leagues?.[0]?.calendar);
  cache.days ||= {};
  const days = [];
  for (let t = from.getTime(); t <= to.getTime(); t += 86400000) { const d = ymd(new Date(t)); if (!cal.size || cal.has(d)) days.push(d); }
  const events = new Map();
  for (const e of today.events || []) events.set(String(e.id), e);
  await Promise.all(days.map(async (d) => {
    // finished days never change: remember their match list
    const old = cache.days[d];
    if (old) { for (const e of old) events.set(e.id, e); return; }
    const j = await espn.get(`${API}${slug}/scoreboard?dates=${d}`).catch(() => null);
    if (!j) return;
    const evs = (j.events || []).map((e) => { const st = e.competitions?.[0]?.status?.type || e.status?.type || {}; return { id: String(e.id), done: !!st.completed, off: !st.completed && (st.state === 'post' || /postpon|cancel|abandon/i.test(`${st.name || ''} ${st.description || ''}`)), date: e.date }; });
    for (const e of evs) events.set(e.id, e);
    if (evs.length && evs.every((e) => e.done || e.off) && Date.parse(d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6)) < now.getTime() - 2 * 86400000) cache.days[d] = evs;
  }));
  const finished = [...events.values()].map((e) => (e.competitions ? { id: String(e.id), done: !!(e.competitions?.[0]?.status?.type || {}).completed } : e)).filter((e) => e.done);
  if (!finished.length) throw new Error('No finished matches in this competition yet');
  // forget older seasons so the remembered data doesn't grow forever
  const keep = new Set(finished.map((e) => e.id));
  for (const id of Object.keys(cache.ev)) if (!keep.has(id)) delete cache.ev[id];
  const first = ymd(from);
  for (const d of Object.keys(cache.days)) if (d < first) delete cache.days[d];
  const todo = finished.filter((e) => !cache.ev[e.id]).slice(0, maxNew);
  await Promise.all(todo.map(async (e) => {
    try { const c = compactMatch(await espn.get(`${API}${slug}/summary?event=${e.id}`)); if (c && Object.keys(c[0].s).length) cache.ev[e.id] = c; } catch { /* skip; try again next build */ }
  }));

  const T = new Map();
  for (const e of finished) {
    const m = cache.ev[e.id]; if (!m) continue;
    const both = shotsOk(m[0]) && shotsOk(m[1]);
    const A = both ? m[0] : { ...m[0], c: null }, B = both ? m[1] : { ...m[1], c: null };
    for (const [me, op] of [[A, B], [B, A]]) {
      if (!T.has(me.id)) T.set(me.id, { id: me.id, name: me.name, short: me.short, logo: me.logo, P: 0, sum: {}, n: {}, raw: { goals: 0, shots: 0, acc: 0, passes: 0, oppPasses: 0, defActs: 0 } });
      const t = T.get(me.id); t.P++;
      for (const [k, , f] of METRICS) { if (!f) continue; const v = f(me, op); if (v == null || !Number.isFinite(v)) continue; t.sum[k] = (t.sum[k] || 0) + v; t.n[k] = (t.n[k] || 0) + 1; }
      const r = t.raw, s = me.s;
      r.goals += me.goals || 0; r.shots += s.totalShots || 0; r.acc += s.accuratePasses || 0; r.passes += s.totalPasses || 0;
      r.oppPasses += op.s.totalPasses || 0; r.defActs += (s.totalTackles || 0) + (s.interceptions || 0) + (s.foulsCommitted || 0);
      if (me.c) { r.cSh = (r.cSh || 0) + me.c.sh; r.cXg = (r.cXg || 0) + me.c.xg; r.cBox = (r.cBox || 0) + me.c.shBox; r.cG = (r.cG || 0) + me.c.g; }
    }
  }
  const teams = [...T.values()].map((t) => {
    const v = {};
    for (const [k, , , , unit] of METRICS) if (t.n[k]) v[k] = unit === 'tot' ? t.sum[k] : t.sum[k] / t.n[k];
    const r = t.raw;
    if (r.cSh) { v.xgShot = r.cXg / r.cSh; v.boxPct = (r.cBox / r.cSh) * 100; v.finish = r.cG - r.cXg; }
    if (r.passes) v.passPct = (r.acc / r.passes) * 100;
    if (r.defActs) v.ppda = r.oppPasses / r.defActs;
    if (v.poss != null && v.poss <= 1) v.poss *= 100;
    return { id: t.id, name: t.name, short: t.short, logo: t.logo, P: t.P, v };
  });
  const rank = {};
  for (const [k, , , dir] of METRICS) {
    const have = teams.filter((t) => t.v[k] != null).sort((a, b) => dir * (b.v[k] - a.v[k]));
    have.forEach((t, j) => { (rank[t.id] ||= {})[k] = j && have[j - 1].v[k] === t.v[k] ? rank[have[j - 1].id][k] : j + 1; });
  }
  teams.forEach((t) => { t.rank = rank[t.id] || {}; });
  const metrics = METRICS.filter(([k]) => teams.some((t) => t.v[k] != null)).map(([key, label, , dir, unit, group]) => ({ key, label, dir, unit, group }));
  return { slug, matches: finished.length, counted: finished.filter((e) => cache.ev[e.id]).length, teams, metrics };
}

// How a league rank reads in a sentence (best first)
const RANK_PHRASE = { goals: 'goals scored', conceded: 'fewest goals conceded', xg: 'expected goals (xG)', xga: 'lowest xG against', big: 'big chances created', ppda: 'pressing intensity', poss: 'possession', shots: 'shots' };

// Talking points from the numbers (Flappy Jim's rules, plus team news and league ranks)
export function talkingPoints({ ev, form, h2h, table, rows, out, ranks }) {
  const pts = [];
  const nm = { home: ev.home.shortName || ev.home.name, away: ev.away.shortName || ev.away.name };
  const ordinal = (n) => { n = +n; if (!n) return '?'; const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  for (const side of ['home', 'away']) {
    const f = form[side] || []; if (!f.length) continue;
    const str = f.map((x) => x.r).join('');
    const w = (str.match(/W/g) || []).length, d = (str.match(/D/g) || []).length, l = (str.match(/L/g) || []).length;
    const gf = f.reduce((a, x) => a + (x.gs?.[0] || 0), 0), ga = f.reduce((a, x) => a + (x.gs?.[1] || 0), 0);
    const cs = f.filter((x) => x.gs && x.gs[1] === 0).length, blank = f.filter((x) => x.gs && x.gs[0] === 0).length;
    pts.push(`${nm[side]} have won ${w}, drawn ${d} and lost ${l} of their last ${f.length}, scoring ${gf} and conceding ${ga}.`);
    let run = 0; for (const x of f) { if (x.r !== 'L') run++; else break; }
    if (run >= 4) pts.push(`${nm[side]} are unbeaten in ${run}${run === f.length ? '+' : ''} games.`);
    let bad = 0; for (const x of f) { if (x.r !== 'W') bad++; else break; }
    if (bad >= 3) pts.push(`${nm[side]} haven't won in ${bad}${bad === f.length ? '+' : ''} games.`);
    if (cs >= 3) pts.push(`${nm[side]} have kept ${cs} clean sheets in their last ${f.length}.`);
    if (blank >= 2) pts.push(`${nm[side]} failed to score in ${blank} of their last ${f.length}.`);
    if (ga >= f.length * 2) pts.push(`${nm[side]} are leaking goals: ${ga} conceded in ${f.length}.`);
  }
  if (h2h.length) {
    const w = h2h.filter((g) => g.r === 'W').length, d = h2h.filter((g) => g.r === 'D').length, l = h2h.filter((g) => g.r === 'L').length;
    const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    pts.push(`Last ${pl(h2h.length, 'meeting', 'meetings')}: ${nm.home} ${pl(w, 'win', 'wins')}, ${pl(d, 'draw', 'draws')}, ${nm.away} ${pl(l, 'win', 'wins')}.`);
  }
  const pos = (t) => (table || []).find((x) => x.id === t.id || x.name === t.shortName || x.full === t.name || x.name === t.name);
  const ph = rows?.home || pos(ev.home), pa = rows?.away || pos(ev.away);
  if (ph && pa) {
    pts.push(`In the table: ${nm.home} ${ordinal(ph.pos)} on ${ph.Pts} point${ph.Pts === 1 ? '' : 's'}, ${nm.away} ${ordinal(pa.pos)} on ${pa.Pts}.`);
    const gap = Math.abs((+ph.Pts || 0) - (+pa.Pts || 0));
    if (gap === 0) pts.push('They are level on points.');
    else if (gap <= 3) pts.push(`Only ${gap} point${gap === 1 ? '' : 's'} separate${gap === 1 ? 's' : ''} them.`);
  }
  for (const side of ['home', 'away']) {
    const o = (out[side] || []).filter((x) => x.why !== 'Doubtful');
    if (o.length >= 3) pts.push(`${nm[side]} are without ${o.length} players: ${o.slice(0, 4).map((x) => x.name).join(', ')}${o.length > 4 ? ' and more' : ''}.`);
    else if (o.length) pts.push(`${nm[side]} will be missing ${o.map((x) => x.name).join(' and ')}.`);
  }
  if (ranks) {
    for (const side of ['home', 'away']) {
      const t = ranks.teams.find((x) => x.id === ev[side].id); if (!t) continue;
      const best = Object.keys(RANK_PHRASE).filter((k) => t.rank[k] && t.rank[k] <= 3).slice(0, 2);
      for (const k of best) pts.push(`${nm[side]} are ${ordinal(t.rank[k])} in the league for ${RANK_PHRASE[k]}.`);
    }
  }
  return pts;
}

// ---- player stats from ESPN's line-ups (used when API-Football isn't available) ------
// Based on Flappy Jim's playerLines / playerScores. Each finished match is remembered
// in `cache` (keyed by event id), so later builds only fetch new matches.
export function posGroup(pos) {
  const p = String(pos || '').toUpperCase();
  if (!p) return '';
  if (p === 'G' || p === 'GK' || p === 'GOALKEEPER') return 'Goalkeeper';
  if (p === 'DEFENDER') return 'Defender';
  if (p === 'MIDFIELDER') return 'Midfielder';
  if (p === 'FORWARD' || p === 'ATTACKER') return 'Attacker';
  if (/^(D|CB|CD|SW|RB|LB|RWB|LWB|WB)(-|$)/.test(p)) return 'Defender';
  if (/^(DM|CM|AM|M|RM|LM|CDM|CAM)(-|$)/.test(p)) return 'Midfielder';
  if (/^(F|CF|ST|S|SS|RW|LW|W|RF|LF)(-|$)/.test(p)) return 'Attacker';
  return '';
}
const pstat = (p, ...keys) => { for (const k of keys) { const x = (p.stats || []).find((s) => s.name === k || s.abbreviation === k); if (x) { const v = parseFloat(x.value ?? x.displayValue); if (Number.isFinite(v)) return v; } } return 0; };
export function playerLines(sum, teamId) {
  const r = (sum?.rosters || []).find((x) => String(x.team?.id ?? '') === String(teamId));
  if (!r) return null;
  const minOf = (p) => { const pl = (p.plays || []).find((x) => x.substitution || /sub/i.test(x.type?.text || '')); const m = pl ? parseInt(pl.clock?.displayValue ?? pl.clock ?? '', 10) : NaN; return Number.isFinite(m) ? m : null; };
  const out = [];
  for (const p of r.roster || []) {
    const played = p.starter || p.subbedIn || pstat(p, 'subIns', 'SUB') > 0 || pstat(p, 'appearances', 'APP') > 0;
    if (!played) continue;
    const m = minOf(p);
    const mins = p.starter ? (p.subbedOut ? (m ?? 70) : 90) : (m != null ? Math.max(1, 90 - m) : 20);
    out.push({ n: p.athlete?.displayName || p.athlete?.shortName || '', pos: posGroup(p.position?.abbreviation) || posGroup(p.athlete?.position?.abbreviation) || posGroup(p.position?.name), st: p.starter ? 1 : 0, m: mins,
      g: pstat(p, 'totalGoals', 'goals', 'G'), a: pstat(p, 'goalAssists', 'assists', 'A'), sh: pstat(p, 'totalShots', 'shots', 'SH'), so: pstat(p, 'shotsOnTarget', 'ST', 'SOT'),
      sv: pstat(p, 'saves', 'SV'), fd: pstat(p, 'foulsSuffered', 'FA'), fc: pstat(p, 'foulsCommitted', 'FC'), y: pstat(p, 'yellowCards', 'YC'), r: pstat(p, 'redCards', 'RC'), og: pstat(p, 'ownGoals', 'OG') });
  }
  return out.filter((x) => x.n);
}
// Flappy Jim's match rating: 6.0 to start, then goals, assists, shots, saves, clean sheets, result, cards
function flappyRating(x, gf, ga) {
  const def = x.pos === 'Goalkeeper' || x.pos === 'Defender';
  let v = 6 + x.g * (def ? 1.4 : 1) + x.a * 0.75 + x.so * 0.25 + Math.max(0, x.sh - x.so) * 0.06 + (x.pos === 'Goalkeeper' ? x.sv * 0.35 : 0) + x.fd * 0.06 - x.fc * 0.07 - x.y * 0.35 - x.r * 1.6 - x.og;
  v += gf > ga ? 0.35 : gf < ga ? -0.35 : 0;
  if (def && x.st) v += ga === 0 ? 0.6 : -0.2 * ga;
  if (!x.st) v = 6 + (v - 6) * 0.6;
  return Math.max(3, Math.min(10, v));
}
export async function espnPlayerSeason(espn, fixtures, teamId, now, cache, { maxNew = 40 } = {}) {
  cache.ev ||= {};
  const start = seasonStart(now).getTime();
  const games = fixtures.past.filter((e) => e.done && e.hs != null && Date.parse(e.date) >= start);
  const keep = new Set(games.map((e) => e.id));
  for (const id of Object.keys(cache.ev)) if (!keep.has(id)) delete cache.ev[id];
  const todo = games.filter((e) => !cache.ev[e.id]).slice(0, maxNew);
  await Promise.all(todo.map(async (e) => {
    try { const lines = playerLines(await summary(espn, e), teamId); if (lines && lines.length) cache.ev[e.id] = lines; } catch { /* try again next build */ }
  }));
  const P = new Map();
  let counted = 0;
  for (const e of games) {
    const lines = cache.ev[e.id]; if (!lines) continue;
    counted++;
    const home = e.home.id === String(teamId), gf = home ? e.hs : e.as, ga = home ? e.as : e.hs;
    for (const x of lines) {
      let p = P.get(x.n);
      if (!p) P.set(x.n, (p = { id: x.n, name: x.n, photo: '', age: null, pos: x.pos, apps: 0, starts: 0, mins: 0, goals: 0, assists: 0, shots: 0, shotsOn: 0, saves: 0, fouled: 0, fouls: 0, yellow: 0, red: 0, rw: 0 }));
      p.pos ||= x.pos; p.apps++; p.starts += x.st; p.mins += x.m;
      p.goals += x.g; p.assists += x.a; p.shots += x.sh; p.shotsOn += x.so; p.saves += x.sv; p.fouled += x.fd; p.fouls += x.fc; p.yellow += x.y; p.red += x.r;
      p.rw += flappyRating(x, gf, ga);
    }
  }
  const players = [...P.values()].map(({ rw, ...p }) => ({ ...p, keyPasses: null, passes: null, passPct: null, dribbles: null, dribblesTried: null, tackles: null, ints: null, blocks: null, duelsWonPct: null, conceded: null, rating: p.apps ? Math.round((rw / p.apps) * 100) / 100 : null })).sort((a, b) => b.mins - a.mins);
  return { players, counted, matches: games.length };
}
