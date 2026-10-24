// Builds everything the Stats pages show. Each source is optional: if one
// fails, its section is left out and the rest of the site still builds.
import { slugify } from '../text.mjs';
import * as E from './espn.mjs';
import { fdGet, fdTable, fdScorers, apiFootball, playerSeason, afInjuries } from './sources.mjs';
import { buildFans } from '../fans/build.mjs';

// "Man United" = "Manchester United FC", but never "Manchester City" (from Flappy Jim)
const CLUB_ALIAS = { 'man united': 'manchester united', 'man utd': 'manchester united', 'man city': 'manchester city', spurs: 'tottenham hotspur', tottenham: 'tottenham hotspur', wolves: 'wolverhampton wanderers', 'nottm forest': 'nottingham forest', 'nott m forest': 'nottingham forest', 'west ham': 'west ham united', psg: 'paris saint germain', inter: 'internazionale', atletico: 'atletico madrid', bayern: 'bayern munich', 'bayern munchen': 'bayern munich', 'brighton hove': 'brighton and hove albion', brighton: 'brighton and hove albion' };
export function clubNorm(n) {
  const x = String(n || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(fc|afc|cf|sc|ac|ssc|club|de|the)\b/g, ' ').replace(/\s+/g, ' ').trim();
  return CLUB_ALIAS[x] || x;
}
export function sameClub(a, b) {
  const A = clubNorm(a), B = clubNorm(b); if (!A || !B) return false; if (A === B) return true;
  const ta = A.split(' '), tb = B.split(' '), [sh, lo] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (sh[0] === lo[0] && sh.every((t) => lo.includes(t)) && !(sh.length === 1 && ['manchester', 'sheffield', 'bristol', 'real', 'athletic', 'sporting', 'inter'].includes(sh[0]))) return true;
  return sh.length === 1 && sh[0].length >= 5 && lo.includes(sh[0]) && !['united', 'city', 'town', 'rovers', 'athletic', 'wanderers', 'albion', 'county', 'forest', 'hotspur', 'madrid', 'munich'].includes(sh[0]);
}
export const findRow = (rows, team) => rows.find((r) => [r.name, r.full, r.short].some((x) => x && [team.name, team.shortName, team.short].some((y) => y && (x === y || sameClub(x, y)))));

const tableKey = (league) => (/premier league/i.test(league) ? 'pl' : /champions league/i.test(league) ? 'ucl' : null);

export async function buildStats({ fetchImpl, env = {}, config, now = new Date(), cache = {}, log = () => {}, signal = null, ownPhotos = {} }) {
  const sc = config.stats || {};
  const espn = E.espnClient(fetchImpl, { signal });
  const sources = [];
  const note = (name, ok, detail = '') => sources.push({ name, ok, detail });
  const team = { id: String(sc.espnTeamId || '364'), name: sc.teamName || 'Liverpool' };
  const data = { updated: now.toISOString(), team, next: [], previews: [], results: [], season: null, seasonLeague: null, tables: {}, scorers: [], ranks: null, players: [], playersSource: null, sources, nextKickoff: null, inPlay: null, afUsage: null };

  // 1. Liverpool's fixtures and results (everything else hangs off these)
  let mine;
  try {
    mine = await E.teamFixtures(espn, team.id, now);
    const t = mine.team;
    if (t) { team.logo = t.logos?.[0]?.href || t.logo || ''; team.name = t.displayName || team.name; }
    data.results = mine.past.slice(0, sc.resultsCount || 8).map((e) => {
      const home = e.home.id === team.id, gf = home ? e.hs : e.as, ga = home ? e.as : e.hs, opp = home ? e.away : e.home;
      return { id: e.id, date: e.date, comp: e.league, home, gf, ga, r: gf > ga ? 'W' : gf < ga ? 'L' : 'D', opp };
    });
    data.inPlay = mine.live?.[0]?.date || null; // a match still going (e.g. extra time) when this build ran
    data.season = E.teamSeason(mine, team.id, now);
    data.seasonLeague = E.teamSeason(mine, team.id, now, mine.past.find((e) => /premier league/i.test(e.league))?.league || 'Premier League');
    note('ESPN fixtures & results', true);
  } catch (err) {
    note('ESPN fixtures & results', false, err.message);
    log(`  stats: ESPN fixtures unavailable (${err.message})`);
  }

  // 2. Tables: football-data.org if there's a key, ESPN otherwise
  const fdKey = env.FOOTBALL_DATA_KEY;
  for (const [key, code, slug, label] of [['pl', 'PL', 'eng.1', 'Premier League'], ['ucl', 'CL', 'uefa.champions', 'Champions League']]) {
    try {
      if (!fdKey) throw new Error('no key');
      const t = fdTable(await fdGet(fetchImpl, fdKey, `competitions/${code}/standings`));
      data.tables[key] = { name: label, rows: t.rows, matchday: t.matchday, source: 'football-data.org' };
    } catch (err) {
      try {
        data.tables[key] = { name: label, rows: await E.espnStandings(espn, slug), source: 'ESPN' };
        if (fdKey) note(`${label} table (football-data.org)`, false, `${err.message}; used ESPN instead`);
      } catch (err2) {
        note(`${label} table`, false, err2.message);
      }
    }
  }
  if (data.tables.pl || data.tables.ucl) note('League tables', true, data.tables.pl?.source || data.tables.ucl?.source);
  if (fdKey) {
    try { data.scorers = fdScorers(await fdGet(fetchImpl, fdKey, 'competitions/PL/scorers?limit=10')); note('Top scorers (football-data.org)', true); } catch (err) { note('Top scorers (football-data.org)', false, err.message); }
  }

  // 3. League-wide team numbers and ranks (ESPN match stats; remembered between builds)
  cache.teamstats ||= {};
  try {
    cache.teamstats.pl ||= {};
    data.ranks = await E.leagueTeamStats(espn, 'eng.1', cache.teamstats.pl, { now });
    note('Premier League team stats (ESPN)', true, `${data.ranks.counted} of ${data.ranks.matches} matches`);
  } catch (err) {
    note('Premier League team stats (ESPN)', false, err.message);
  }

  // 4. Player stats and injuries (API-Football, 100 requests a day on the free plan)
  const afKey = env.API_FOOTBALL_KEY;
  const af = afKey ? apiFootball(fetchImpl, afKey, cache, now, log, signal) : null;
  const afTeam = sc.apiFootballTeamId || 40;
  if (af) {
    try {
      const season = E.seasonOf(now);
      const first = await af.get('players', { team: afTeam, season, page: 1 }, 20);
      const pages = [first];
      const total = Math.min(4, first.paging?.total || 1);
      for (let p = 2; p <= total; p++) pages.push(await af.get('players', { team: afTeam, season, page: p }, 20));
      data.players = playerSeason(pages);
      note('Player stats (API-Football)', data.players.length > 0, data.players.length ? '' : 'no players returned');
    } catch (err) {
      note('Player stats (API-Football)', false, err.message);
    }
  }

  // 4b. No player stats from API-Football: work them out from ESPN's line-ups instead
  data.playersSource = data.players.length ? 'API-Football' : null;
  if (!data.players.length && mine) {
    try {
      cache.players ||= {};
      const r = await E.espnPlayerSeason(espn, mine, team.id, now, cache.players);
      data.players = r.players;
      if (r.players.length) data.playersSource = 'ESPN';
      note('Player stats (ESPN line-ups)', r.players.length > 0, `${r.counted} of ${r.matches} matches`);
    } catch (err) {
      note('Player stats (ESPN line-ups)', false, err.message);
    }
  }

  // 5. The next five matches, each with a preview
  if (mine) {
    let afFixtures = [];
    if (af) {
      try { afFixtures = (await af.get('fixtures', { team: afTeam, next: sc.nextCount || 5 }, 6)).response || []; } catch (err) { note('Fixture injuries (API-Football)', false, err.message); }
    }
    const upcoming = mine.upcoming.slice(0, sc.nextCount || 5);
    // only a confirmed kick-off time is used to time the matchday rebuilds
    data.nextKickoff = upcoming[0] && !upcoming[0].tbc ? upcoming[0].date : null;
    const usedSlugs = new Set();
    for (const ev of upcoming) {
      const isHome = ev.home.id === team.id;
      const opp = isHome ? ev.away : ev.home;
      let slug = `${String(ev.date).slice(0, 10)}-${slugify(opp.shortName || opp.name)}`;
      while (usedSlugs.has(slug)) slug += '-2';
      usedSlugs.add(slug);
      const card = { id: ev.id, slug, date: ev.date, tbc: !!ev.tbc, comp: ev.league, venue: ev.venue, home: ev.home, away: ev.away, isHome, opp };
      data.next.push(card);
      try {
        const [oppFix, sum] = await Promise.all([E.teamFixtures(espn, opp.id, now).catch(() => ({ past: [], upcoming: [] })), E.summary(espn, ev).catch(() => ({}))]);
        const fixOf = { [team.id]: mine, [opp.id]: oppFix };
        const before = Date.parse(ev.date);
        const form = { home: E.formFrom(fixOf[ev.home.id], ev.home.id, before), away: E.formFrom(fixOf[ev.away.id], ev.away.id, before) };
        const h2h = E.headToHead(sum, ev.home.id);
        const out = { home: await E.unavailable(espn, ev.home, ev, sum), away: await E.unavailable(espn, ev.away, ev, sum) };
        // API-Football's injury list for this fixture (covers Europe too)
        const afFx = afFixtures.find((f) => Math.abs(Date.parse(f.fixture?.date) - before) < 36 * 3600000 && [f.teams?.home?.name, f.teams?.away?.name].some((n) => sameClub(n, opp.name) || sameClub(n, opp.shortName)));
        let usedAf = false;
        if (af && afFx) {
          try {
            const list = afInjuries(await af.get('injuries', { fixture: afFx.fixture.id }, 6));
            usedAf = true;
            for (const inj of list) {
              const side = sameClub(inj.team, team.name) ? (isHome ? 'home' : 'away') : (isHome ? 'away' : 'home');
              if (!out[side].some((o) => E.sameName(o.name, inj.name))) out[side].push({ name: inj.name, why: inj.why, detail: inj.detail });
              else { const o = out[side].find((x) => E.sameName(x.name, inj.name)); if (!o.detail) o.detail = inj.detail; }
            }
          } catch (err) { /* injuries are a bonus */ }
        }
        const tk = tableKey(ev.league);
        const table = tk && data.tables[tk] ? data.tables[tk].rows : [];
        const seasons = { home: E.teamSeason(fixOf[ev.home.id], ev.home.id, now), away: E.teamSeason(fixOf[ev.away.id], ev.away.id, now) };
        const ranks = tk === 'pl' ? data.ranks : null;
        const tableRows = { home: table.length ? findRow(table, ev.home) : null, away: table.length ? findRow(table, ev.away) : null };
        const points = E.talkingPoints({ ev, form, h2h, table, rows: tableRows, out, ranks });
        data.previews.push({ ...card, afInjuries: usedAf, form, h2h, out, seasons, tableKey: tk, tableRows, points, venue: sum.gameInfo?.venue?.fullName || ev.venue || '' });
      } catch (err) {
        data.previews.push({ ...card, error: err.message, form: { home: [], away: [] }, h2h: [], out: { home: [], away: [] }, seasons: null, points: [] });
      }
    }
    if (upcoming.length) note('Match previews', true, `${upcoming.length} matches`);
  }

  // 6. The fan zone: squad, faces, predicted line-ups and matches to rate
  data.fans = null;
  if (mine && config.fans?.enabled !== false) {
    try {
      data.fans = await buildFans({ espn, fetchImpl, data, mine, cache, config, now, log, ownPhotos });
      note('Fan zone (squad, line-ups, faces)', true, `${data.fans.squad.length} players, ${data.fans.rate.length} matches to rate${data.fans.lineup?.oppXI ? `, ${data.fans.lineup.opp.shortName} predicted XI` : ''}`);
    } catch (err) {
      note('Fan zone (squad, line-ups, faces)', false, err.message);
    }
  }

  if (af) data.afUsage = af.usage();
  data.espnRequests = espn.stats.requests;
  return { data, cache };
}
