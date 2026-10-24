import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStats, sameClub, findRow } from '../lib/stats/index.mjs';
import { shotXg, sameName, talkingPoints, teamSeason } from '../lib/stats/espn.mjs';
import { playerSeason, afInjuries } from '../lib/stats/sources.mjs';
import { decideRebuild } from '../lib/rebuild.mjs';
import { statsPage, previewPage, fmtMetric, compName, ordinal } from '../src/stats-templates.mjs';
import { statsFetch, calls, TEST_NOW } from './fixtures/stats-fixtures.mjs';
import { build } from '../scripts/build.mjs';
import siteConfig from '../site.config.mjs';

const KEYS = { FOOTBALL_DATA_KEY: 'fd-test-key', API_FOOTBALL_KEY: 'af-test-key' };
const run = async (opts = {}, env = KEYS, cache = {}) => {
  const before = calls.length;
  const r = await buildStats({ fetchImpl: statsFetch(opts), env, config: siteConfig, now: TEST_NOW, cache });
  return { ...r, made: calls.slice(before) };
};

test('stats: everything from all three sources', async () => {
  const { data, made } = await run();
  assert.deepEqual(data.sources.filter((s) => !s.ok), [], 'no failures');
  // next five (a sixth exists in the data), in order, each with its own address
  assert.deepEqual(data.next.map((n) => n.slug), ['2026-10-25-brighton', '2026-10-28-real-madrid', '2026-11-01-aston-villa', '2026-11-04-crystal-palace', '2026-11-08-arsenal']);
  assert.equal(data.previews.length, 5);
  assert.equal(data.nextKickoff, '2026-10-25T14:00Z');
  // results, newest first, from Liverpool's point of view
  assert.equal(data.results.length, 8);
  assert.deepEqual([data.results[0].r, data.results[0].gf, data.results[0].ga, data.results[0].opp.name], ['W', 4, 3, 'Villarreal']);
  assert.deepEqual([data.results[3].r, data.results[3].gf, data.results[3].ga], ['L', 1, 2]);
  // season: 8 league + 3 European games
  assert.equal(data.season.P, 11);
  assert.equal(data.seasonLeague.P, 8);
  assert.equal(data.seasonLeague.pts, 17);
  // tables from football-data.org
  assert.equal(data.tables.pl.source, 'football-data.org');
  assert.equal(data.tables.pl.rows.length, 20);
  assert.equal(data.tables.ucl.rows.length, 36);
  assert.equal(data.scorers[0].name, 'Erling Haaland');
  // league-wide ranks for all 20 teams
  assert.equal(data.ranks.teams.length, 20);
  const lfc = data.ranks.teams.find((t) => t.id === '364');
  assert.equal(lfc.P, 8);
  assert.equal(lfc.v.goals, 15 / 8);
  assert.ok(lfc.v.xg > 0.5 && lfc.v.xg < 5, `xG estimate looks sane (${lfc.v.xg})`);
  // players: two competitions added together
  const salah = data.players.find((p) => p.name === 'Mohamed Salah');
  assert.equal(salah.goals, 6);
  assert.equal(salah.mins, 905);
  assert.equal(salah.passPct, null, 'API-Football pass accuracy is not trusted');
  assert.equal(salah.rating, 7.61);
  assert.equal(data.players[0].name, 'Virgil van Dijk', 'sorted by minutes');
  // API-Football used sparingly
  assert.equal(data.afUsage.used, 5, '2 player pages + fixtures + 2 injury lists');
  assert.ok(!made.some((u) => u.includes('api-sports') && u.includes('season=2025')), 'asks for the 2026 season');
});

test('stats: previews have form, team news, table rows and readable talking points', async () => {
  const { data } = await run();
  const [bri, rma, , cup] = data.previews;
  assert.equal(bri.venue, 'Anfield');
  assert.equal(bri.form.home.length, 5);
  assert.equal(bri.form.away.length, 5);
  assert.equal(bri.form.home[0].opp, 'Villarreal');
  // Premier League clubs: the Fantasy Premier League list (kept up to date by the Premier League) replaces ESPN's
  assert.deepEqual(bri.out.home.map((o) => [o.name, o.why, o.chance]), [['Dominik Szoboszlai', 'Out', null], ['Giovanni Leoni', 'Out', null], ['Wataru Endo', 'Suspended', null], ['Victor Munoz', 'Doubtful', 50], ['Alisson Becker', 'Doubtful', 75]]);
  assert.equal(bri.out.home[0].detail, 'Hamstring injury - Expected back 08 Nov');
  assert.equal(bri.out.home[0].since, '23 Oct');
  assert.ok(!bri.out.home.some((o) => /chiesa|salah/i.test(o.name)), 'loanees and fit players left out');
  // ESPN still says Welbeck is doubtful, FPL says he's fit again: FPL wins
  assert.deepEqual(bri.out.away.map((o) => [o.name, o.why, o.chance]), [['Solly March', 'Out', null], ['Kaoru Mitoma', 'Doubtful', 25], ['Jason Steele', 'Doubtful', 50]]);
  assert.deepEqual(bri.newsSources, { home: ['Fantasy Premier League'], away: ['Fantasy Premier League'] });
  assert.ok(data.sources.find((x) => /Fantasy Premier League/.test(x.name)).ok);
  // Champions League: table rows found by name, Real Madrid's suspension
  assert.equal(rma.tableKey, 'ucl');
  assert.equal(rma.tableRows.home.name, 'Real Madrid');
  assert.equal(rma.tableRows.away.name, 'Liverpool');
  assert.deepEqual(rma.out.home.map((o) => o.why), ['Suspended']);
  // Real Madrid aren't in the Premier League: ESPN / API-Football. Liverpool's list is FPL's,
  // minus Endo's ban (Premier League only)
  assert.deepEqual(rma.newsSources.home, ['ESPN', 'API-Football']);
  assert.deepEqual(rma.out.away.map((o) => o.name), ['Dominik Szoboszlai', 'Giovanni Leoni', 'Victor Munoz', 'Alisson Becker']);
  assert.ok(rma.points.includes('They are level on points.'));
  // cup game: no table
  assert.equal(cup.tableKey, null);
  assert.ok(!cup.points.some((p) => /In the table/.test(p)));
  for (const p of data.previews) {
    for (const t of p.points) {
      assert.doesNotMatch(t, /\b1 (wins|draws|points)\b|\bOnly 0\b|undefined|NaN|null/, t);
      assert.match(t, /\.$/);
    }
  }
  assert.ok(bri.points.some((t) => /^Last 2 meetings: Liverpool 1 win, 1 draw, Brighton 0 wins\.$/.test(t)), bri.points.join('\n'));
});

test('stats: second build reuses remembered match data and API-Football answers', async () => {
  const first = await run();
  const cache = JSON.parse(JSON.stringify(first.cache)); // as if saved to stats-cache.json and read back
  const second = await run({}, KEYS, cache);
  // ESPN player lines are remembered too
  const e1 = await run({}, {});
  const e2 = await run({}, {}, JSON.parse(JSON.stringify(e1.cache)));
  assert.deepEqual(e2.data.players, e1.data.players);
  assert.ok(e2.made.length < 40, `second ESPN-only build makes few requests (${e2.made.length} v ${e1.made.length})`);
  assert.equal(second.data.afUsage.used, 0, 'API-Football answers still fresh');
  const summaries = (m) => m.filter((u) => u.includes('/eng.1/summary')).length;
  assert.ok(summaries(first.made) >= 80);
  assert.ok(summaries(second.made) <= 5, `only the preview summaries are refetched (${summaries(second.made)})`);
  assert.deepEqual(second.data.ranks.teams.find((t) => t.id === '364').v, first.data.ranks.teams.find((t) => t.id === '364').v);
  // the next day the player stats are fetched again
  const later = await buildStats({ fetchImpl: statsFetch(), env: KEYS, config: siteConfig, now: new Date(TEST_NOW.getTime() + 25 * 3600000), cache });
  assert.ok(later.data.afUsage.used >= 3);
});

test('stats: without keys, ESPN alone still gives fixtures, a PL table and previews', async () => {
  const { data, made } = await run({}, {});
  assert.equal(data.tables.pl.source, 'ESPN');
  assert.equal(data.tables.pl.rows[1].name, 'Liverpool');
  assert.equal(data.tables.ucl, undefined, 'no ESPN fixture for the UCL table: section left out');
  // player stats worked out from ESPN line-ups instead
  assert.equal(data.playersSource, 'ESPN');
  assert.equal(data.players.length, 13);
  const gk = data.players.find((p) => p.name === 'Alisson Becker');
  assert.deepEqual([gk.pos, gk.apps, gk.starts, gk.mins, gk.saves], ['Goalkeeper', 11, 11, 990, 33]);
  const sub = data.players.find((p) => p.name === 'Rio Ngumoha');
  assert.deepEqual([sub.starts, sub.mins], [0, 11 * 25], 'came on at 65 minutes in every game');
  assert.equal(data.players.find((p) => p.name === 'Bradley Barcola').mins, 11 * 65, 'taken off at 65 minutes');
  assert.equal(data.players.reduce((a, p) => a + p.goals, 0), 25, 'every goal credited to someone');
  assert.ok(data.players.every((p) => p.rating >= 3 && p.rating <= 10 && p.passPct === null));
  assert.equal(data.previews.length, 5);
  assert.ok(!made.some((u) => /football-data|api-sports/.test(u)), 'never calls the keyed APIs without keys');
});

test('stats: a refused key or an API error only removes its own section', async () => {
  const fd = await run({ failFd: true });
  assert.equal(fd.data.tables.pl.source, 'ESPN', 'falls back to ESPN');
  assert.ok(fd.data.sources.some((s) => !s.ok && /not in the free plan/.test(s.detail)));
  assert.deepEqual(fd.data.scorers, []);
  const af = await run({ failAf: true });
  assert.equal(af.data.playersSource, 'ESPN', 'API-Football refused: ESPN line-ups instead');
  const note = af.data.sources.find((s) => s.name.startsWith('Player stats'));
  assert.equal(note.ok, false);
  assert.match(note.detail, /Free plans do not have access/);
  assert.equal(af.data.previews.length, 5);
  const wrongKey = await run({}, { ...KEYS, API_FOOTBALL_KEY: 'nope' });
  assert.match(wrongKey.data.sources.find((s) => s.name.startsWith('Player stats')).detail, /application key/);
  // API-Football nearly used up for the day: stops asking
  const low = await run({ afRemaining: 5 });
  assert.ok(low.data.afUsage.used <= 2, `stops early (${low.data.afUsage.used})`);
});

test('stats: ESPN completely down', async () => {
  const down = async () => new Response('down', { status: 503 });
  const { data } = await buildStats({ fetchImpl: down, env: {}, config: siteConfig, now: TEST_NOW });
  assert.deepEqual(data.next, []);
  assert.deepEqual(data.results, []);
  assert.ok(data.sources.every((s) => !s.ok));
});

test('stats helpers: xG, names, clubs, players, injuries', () => {
  assert.equal(shotXg('Goal! Liverpool 1, Brighton 0. Mohamed Salah (Liverpool) converts the penalty with a left footed shot.'), 0.76);
  assert.equal(shotXg('Attempt missed. X (Liverpool) right footed shot from outside the box misses to the left.'), 0.035);
  assert.equal(shotXg('Attempt saved. X (Liverpool) header from very close range is saved.'), 0.35);
  assert.ok(sameName('D. Szoboszlai', 'Dominik Szoboszlai'));
  assert.ok(sameName('Kylian Mbappé', 'Kylian Mbappe'));
  assert.ok(!sameName('Mohamed Salah', 'Mohamed Elneny'));
  assert.ok(sameClub('Man United', 'Manchester United FC'));
  assert.ok(!sameClub('Manchester City', 'Manchester United'));
  assert.ok(sameClub('Brighton Hove', 'Brighton & Hove Albion'));
  assert.ok(sameClub('Inter', 'FC Internazionale Milano'));
  assert.ok(!sameClub('Real Madrid', 'Real Sociedad'));
  assert.equal(findRow([{ name: 'Nottingham', full: 'Nottingham Forest FC' }], { name: 'Nottingham Forest', shortName: "Nott'm Forest" }).name, 'Nottingham');
  // pass accuracy as a percentage (season stats) or a count (match stats)
  const p = playerSeason([{ response: [{ player: { id: 1, name: 'A' }, statistics: [{ games: { appearences: 2, minutes: 180, rating: '7.0' }, passes: { total: 100, accuracy: 80 } }, { games: { appearences: 1, minutes: 90, rating: '8.0' }, passes: { total: 50, accuracy: 45 } }] }] }]);
  assert.equal(p[0].passPct, null);
  // friendlies are left out
  const fr = playerSeason([{ response: [{ player: { id: 3, name: 'F' }, statistics: [{ league: { name: 'Friendlies Clubs' }, games: { appearences: 3, minutes: 270 }, goals: { total: 5 } }, { league: { name: 'Premier League' }, games: { appearences: 1, minutes: 90 }, goals: { total: 1 } }] }] }]);
  assert.deepEqual([fr[0].apps, fr[0].goals], [1, 1]);
  assert.equal(afInjuries({ response: [{ player: { name: 'Y', type: 'Missing Fixture', reason: 'Red Card' }, team: {} }] })[0].why, 'Suspended');
  assert.equal(p[0].rating, 7.33);
  assert.deepEqual(playerSeason([{ response: [{ player: { id: 2, name: 'Unused' }, statistics: [{ games: { appearences: 0, minutes: 0 } }] }] }]), []);
  assert.deepEqual(afInjuries({ response: [{ player: { name: 'X', type: 'Questionable', reason: 'Knock' }, team: { id: 1, name: 'T' } }, { player: { name: '' } }] }).map((i) => i.why), ['Doubtful']);
  assert.equal(teamSeason({ past: [] }, '1', TEST_NOW).P, 0);
  assert.deepEqual(talkingPoints({ ev: { home: { id: '1', name: 'A' }, away: { id: '2', name: 'B' } }, form: {}, h2h: [], table: [], out: {}, ranks: null }), []);
});

test('stats formatting', () => {
  assert.equal(fmtMetric(52.36, 'pct'), '52.4%');
  assert.equal(fmtMetric(-3.31, 'tot'), '−3.3');
  assert.equal(fmtMetric(3.3, 'tot'), '+3.3');
  assert.equal(fmtMetric(524.9, 'pg'), '525');
  assert.equal(fmtMetric(15.25, 'pg'), '15.3');
  assert.equal(fmtMetric(1.875, 'pg'), '1.88');
  assert.equal(fmtMetric(null, 'pg'), '–');
  assert.equal(compName('English Premier League'), 'Premier League');
  assert.equal(compName('UEFA Champions League'), 'Champions League');
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st']);
});

test('stats pages escape everything that comes from the APIs', async () => {
  const { data } = await run();
  const evil = '<img src=x onerror=alert(1)>"\'';
  const p = structuredClone(data.previews[0]);
  p.away.name = evil; p.away.shortName = evil; p.opp = p.away; p.points = [evil]; p.out.away = [{ name: evil, why: 'Out', detail: evil }]; p.venue = evil;
  const d = structuredClone(data);
  d.next[0] = { ...d.next[0], opp: p.away, away: p.away };
  d.tables.pl.rows[0].name = evil; d.players[0].name = evil; d.scorers[0].name = evil; d.ranks.teams[0].name = evil;
  const ctx = { config: { ...siteConfig, siteUrl: 'https://koponpodcast.com' }, assets: new Proxy({}, { get: (_, k) => `/assets/${String(k)}` }), comments: { provider: 'none' }, builtAt: TEST_NOW, stats: d };
  for (const html of [statsPage(ctx), previewPage(ctx, p)]) {
    assert.ok(!html.includes('<img src=x'), 'no injected tag');
    assert.ok(!/<script[^>]*>(?![\s\S]*?<\/script>)/.test(html));
    assert.ok(!/<[^>]*onerror=alert/.test(html.replace(/"[^"]*"/g, '""')), 'attribute not injected');
  }
  // the ranks JSON can't close its <script>
  d.ranks.teams[0].short = '</script><script>alert(1)</script>';
  assert.ok(!statsPage(ctx).includes('</script><script>alert(1)'));
  // no stats at all: still a friendly page
  assert.match(statsPage({ ...ctx, stats: null }), /having a breather/);
});

test('rebuild checker: after a match and on matchday', () => {
  const feed = { count: 1, signature: 's', latestGuid: 'g' };
  const base = { signature: 's', latestGuid: 'g', nextKickoff: '2026-10-25T14:00:00Z' };
  const at = (iso, builtAt) => decideRebuild({ ...base, builtAt }, feed, { now: new Date(iso) });
  // match ended: straight away in the first 45 minutes after it should have finished
  assert.equal(at('2026-10-25T16:20:00Z', '2026-10-25T09:00:00Z').rebuild, true);
  assert.match(at('2026-10-25T16:20:00Z', '2026-10-25T09:00:00Z').reason, /Match finished/);
  assert.equal(at('2026-10-25T15:50:00Z', '2026-10-25T09:00:00Z').rebuild, false, 'not before the final whistle');
  // later than that, only in the 3-hourly slot
  assert.equal(at('2026-10-25T17:20:00Z', '2026-10-25T09:00:00Z').rebuild, false);
  assert.equal(at('2026-10-25T18:05:00Z', '2026-10-25T09:00:00Z').rebuild, true);
  // already rebuilt after the match: nothing to do
  assert.equal(at('2026-10-25T16:40:00Z', '2026-10-25T16:20:00Z').rebuild, false);
  // matchday: team news refreshed every 3-hourly slot if the build is 6 h old
  assert.match(at('2026-10-25T06:05:00Z', '2026-10-24T21:00:00Z').reason, /Matchday/);
  assert.equal(at('2026-10-25T06:05:00Z', '2026-10-24T21:00:00Z').rebuild, true);
  assert.equal(at('2026-10-25T06:05:00Z', '2026-10-25T03:00:00Z').rebuild, false, 'built 3 h ago');
  assert.equal(at('2026-10-23T06:05:00Z', '2026-10-22T21:00:00Z').rebuild, false, 'two days out');
  // worst case with every build failing: a day of 15-minute checks around a match
  let builds = 0;
  for (let t = Date.parse('2026-10-25T00:00:00Z'); t < Date.parse('2026-10-26T00:00:00Z'); t += 15 * 60000) if (at(new Date(t).toISOString(), '2026-10-24T20:00:00Z').rebuild) builds++;
  assert.ok(builds <= 11, `at most 11 builds (${builds})`);
  // no stats on the live site: unchanged behaviour
  assert.equal(decideRebuild({ ...base, nextKickoff: null, builtAt: '2026-10-25T09:00:00Z' }, feed, { now: new Date('2026-10-25T16:20:00Z') }).rebuild, false);
});

test('build: stats pages, sitemap, status and the remembered stats', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kopon-stats-'));
  const feedFile = join(dir, 'feed.xml');
  await writeFile(feedFile, (await readFile(new URL('./fixtures/podcast.xml', import.meta.url), 'utf8')).replaceAll('{{AUDIO}}', 'https://example.com/a.mp3'));
  const sports = statsFetch();
  let liveCache = null;
  const fetchImpl = async (url, init) => {
    if (/espn\.com|football-data|api-sports/.test(url)) return sports(url, init);
    if (url.includes('/site-status.json')) return new Response('{"signature":"x"}');
    if (url.includes('/stats-cache.json')) return liveCache ? new Response(liveCache) : new Response('no', { status: 404 });
    return new Response('no', { status: 404 });
  };
  const env = { KOPON_FEED_FILE: feedFile, KOPON_SKIP_NEWS: '1', KOPON_SKIP_SHORTS: '1', ...KEYS };
  const out1 = join(dir, 'one');
  await build({ env, fetch: fetchImpl, outDir: out1, now: TEST_NOW.toISOString(), quiet: true });
  const page = await readFile(join(out1, 'stats/index.html'), 'utf8');
  assert.match(page, /Next 5 matches/);
  assert.match(page, /href="\/stats\/2026-10-25-brighton\/"/);
  assert.match(await readFile(join(out1, 'stats/2026-10-25-brighton/index.html'), 'utf8'), /Talking points/);
  const sitemap = await readFile(join(out1, 'sitemap.xml'), 'utf8');
  assert.match(sitemap, /\/stats\/<\/loc>/);
  assert.match(sitemap, /\/stats\/2026-11-08-arsenal\/<\/loc>/);
  assert.equal(JSON.parse(await readFile(join(out1, 'site-status.json'), 'utf8')).nextKickoff, '2026-10-25T14:00Z');
  assert.match(await readFile(join(out1, 'robots.txt'), 'utf8'), /Disallow: \/stats-cache.json/);
  liveCache = await readFile(join(out1, 'stats-cache.json'), 'utf8');
  assert.ok(!/fd-test-key|af-test-key/.test(liveCache), 'no keys in the published cache');
  assert.ok(!/fd-test-key|af-test-key/.test(page));

  // everything down next time: the last good numbers are shown, marked as such
  const down = async (url, init) => (/espn\.com|football-data|api-sports/.test(url) ? new Response('down', { status: 503 }) : fetchImpl(url, init));
  const out2 = join(dir, 'two');
  await build({ env, fetch: down, outDir: out2, now: new Date(TEST_NOW.getTime() + 3600000).toISOString(), quiet: true });
  const page2 = await readFile(join(out2, 'stats/index.html'), 'utf8');
  assert.match(page2, /last good numbers/);
  assert.match(page2, /2026-10-25-brighton/);
  // …and the cache it publishes still holds the good data, not the empty result
  assert.equal(JSON.parse(await readFile(join(out2, 'stats-cache.json'), 'utf8')).data.next.length, 5);

  // a week later with ESPN down: matches already played are not shown as "next"
  const out3 = join(dir, 'three');
  await build({ env, fetch: down, outDir: out3, now: '2026-11-02T12:00:00Z', quiet: true });
  const page3 = await readFile(join(out3, 'stats/index.html'), 'utf8');
  assert.ok(!page3.includes('2026-10-25-brighton'));
  assert.match(page3, /2026-11-04-crystal-palace/);

  // stats switched off
  const out4 = join(dir, 'four');
  await build({ env: { ...env, KOPON_SKIP_STATS: '1' }, fetch: fetchImpl, outDir: out4, now: TEST_NOW.toISOString(), quiet: true });
  assert.match(await readFile(join(out4, 'stats/index.html'), 'utf8'), /having a breather/);
});

test('review fixes: friendlies, TBC kick-offs, matches still going, postponed days', async () => {
  const { teamFixtures, normEvent, espnClient, leagueTeamStats, playerLines } = await import('../lib/stats/espn.mjs');
  const T = (id, name) => ({ id, displayName: name, shortDisplayName: name, abbreviation: name.slice(0, 3).toUpperCase() });
  const E = (id, date, league, h, a, st, hs, as, extra = {}) => ({ id, date, league: { name: league, slug: 'x' }, competitions: [{ ...extra, status: { type: st }, competitors: [{ homeAway: 'home', team: T(h, 'H' + h), score: hs }, { homeAway: 'away', team: T(a, 'A' + a), score: as }] }] });
  const done = { completed: true, state: 'post' }, pre = { completed: false, state: 'pre' }, inn = { completed: false, state: 'in' };
  const sched = {
    past: [E('1', '2026-07-20T12:00Z', 'Club Friendly', '364', '9', done, '5', '0'), E('2', '2026-08-23T14:00Z', 'English Premier League', '364', '8', done, '2', '1'), E('3', '2026-08-30T14:00Z', 'English Premier League', '364', '7', done, '', ''),
      E('4', '2026-10-23T09:00Z', 'English Carabao Cup', '364', '6', inn, '1', '1')],
    next: [E('5', '2026-12-13T00:00Z', 'English Premier League', '5', '364', pre, null, null, { timeValid: false }), E('6', '2026-11-01T15:00Z', 'English Premier League', '364', '4', { completed: false, state: 'post', name: 'STATUS_POSTPONED' }, null, null), E('7', '2026-11-08T15:00Z', 'English Premier League', '364', '3', pre, null, null)],
  };
  const fetchImpl = async (url) => new Response(JSON.stringify(/fixture=true/.test(url) ? { events: sched.next } : /season=2026/.test(url) ? { events: sched.past } : { events: [] }));
  const f = await teamFixtures(espnClient(fetchImpl), '364', TEST_NOW);
  assert.deepEqual(f.past.map((e) => e.id), ['2'], 'friendly and the score-less "result" left out');
  assert.deepEqual(f.live.map((e) => e.id), ['4'], 'match still going');
  assert.deepEqual(f.upcoming.map((e) => [e.id, e.tbc]), [['7', false], ['5', true]], 'postponed match not shown; TBC flagged');
  assert.equal(normEvent(E('8', '2026-11-08T15:00Z', 'x', '1', '2', { completed: false, state: 'pre', shortDetail: 'TBD' }, null, null)).tbc, true);

  // buildStats: a TBC first match isn't used to time rebuilds; the live match is reported
  const evs = [...sched.past, ...sched.next];
  const fi = async (url) => {
    if (/teams\/364\/schedule/.test(url)) return fetchImpl(url);
    if (/summary/.test(url)) return new Response('{}');
    return new Response(JSON.stringify({ events: [] }));
  };
  sched.next.splice(0, 0, sched.next.splice(2, 1)[0]); void evs;
  const tbcFirst = await buildStats({ fetchImpl: async (url) => (/fixture=true/.test(url) ? new Response(JSON.stringify({ events: [E('5', '2026-10-24T00:00Z', 'English Premier League', '5', '364', pre, null, null, { timeValid: false })] })) : fi(url)), env: {}, config: siteConfig, now: TEST_NOW });
  assert.equal(tbcFirst.data.nextKickoff, null);
  assert.equal(tbcFirst.data.next[0].tbc, true);
  assert.equal(tbcFirst.data.inPlay, '2026-10-23T09:00Z');
  const ctx = { config: siteConfig, assets: new Proxy({}, { get: (_, k) => `/assets/${String(k)}` }), comments: { provider: 'none' }, builtAt: TEST_NOW, stats: tbcFirst.data };
  const html = statsPage(ctx);
  assert.match(html, /Sat 24 Oct · time TBC/);
  assert.ok(!/00:00|01:00/.test(html.slice(html.indexOf('class="fixtures"'), html.indexOf('</ol>', html.indexOf('class="fixtures"')))), 'no made-up kick-off time');

  // a day whose only other match was postponed is remembered, not re-fetched every build
  const sb = [];
  const dayFetch = async (url) => {
    sb.push(url);
    if (/scoreboard/.test(url)) {
      const d = new URL(url).searchParams.get('dates');
      return new Response(JSON.stringify({ leagues: [{ calendar: ['2026-08-23T07:00Z'] }], events: d === '20260823' ? [{ id: 'a', date: '2026-08-23T14:00Z', competitions: [{ status: { type: done } }] }, { id: 'b', date: '2026-08-23T14:00Z', competitions: [{ status: { type: { completed: false, state: 'post', name: 'STATUS_POSTPONED' } } }] }] : [] }));
    }
    return new Response(JSON.stringify({ boxscore: { teams: [{ team: T('1', 'One'), statistics: [{ name: 'totalShots', displayValue: '5' }] }, { team: T('2', 'Two'), statistics: [{ name: 'totalShots', displayValue: '3' }] }] }, header: { competitions: [{ competitors: [{ id: '1', score: '1' }, { id: '2', score: '0' }] }] } }));
  };
  const c = {};
  await leagueTeamStats(espnClient(dayFetch), 'eng.1', c, { now: TEST_NOW });
  assert.deepEqual(Object.keys(c.days), ['20260823']);
  c.ev.old = [{}]; c.days['20250101'] = [];
  sb.length = 0;
  await leagueTeamStats(espnClient(dayFetch), 'eng.1', c, { now: TEST_NOW });
  assert.ok(!sb.some((u) => u.includes('dates=20260823')), 'remembered day not fetched again');
  assert.ok(!c.ev.old && !c.days['20250101'], 'old seasons forgotten');

  // a substitute listed as "SUB" gets his real position from the athlete record
  const lines = playerLines({ rosters: [{ team: { id: '364' }, roster: [{ athlete: { displayName: 'Sub Man', position: { abbreviation: 'CM' } }, position: { abbreviation: 'SUB' }, starter: false, subbedIn: true, stats: [] }] }] }, '364');
  assert.equal(lines[0].pos, 'Midfielder');
});

test('review fixes: API-Football refusals remembered, network errors fall back, old answers pruned', async () => {
  const { apiFootball } = await import('../lib/stats/sources.mjs');
  let n = 0, mode = 'refuse';
  const f = async () => {
    n++;
    if (mode === 'down') throw new Error('ECONNRESET');
    if (mode === 'refuse') return new Response(JSON.stringify({ errors: { plan: 'Free plans do not have access to this season' }, response: [] }), { headers: { 'x-ratelimit-requests-remaining': '90' } });
    return new Response(JSON.stringify({ errors: [], response: [{ ok: 1 }] }), { headers: { 'x-ratelimit-requests-remaining': '90' } });
  };
  const cache = {};
  await assert.rejects(apiFootball(f, 'k', cache, TEST_NOW).get('players', { page: 1 }, 20), /Free plans/);
  await assert.rejects(apiFootball(f, 'k', cache, new Date(TEST_NOW.getTime() + 3600000)).get('players', { page: 1 }, 20), /Free plans/);
  assert.equal(n, 1, 'the refusal is not asked again in the next build');
  mode = 'ok';
  const later = new Date(TEST_NOW.getTime() + 21 * 3600000);
  assert.deepEqual((await apiFootball(f, 'k', cache, later).get('players', { page: 1 }, 20)).response, [{ ok: 1 }]);
  mode = 'down';
  const muchLater = new Date(later.getTime() + 21 * 3600000);
  assert.deepEqual((await apiFootball(f, 'k', cache, muchLater).get('players', { page: 1 }, 20)).response, [{ ok: 1 }], 'network down: last good answer');
  apiFootball(f, 'k', cache, new Date(muchLater.getTime() + 4 * 86400000));
  assert.deepEqual(cache.af, {}, 'answers older than 3 days are dropped');
});

test('review fixes: preview table colours use the full table; bad dates never stop a build', async () => {
  const { data } = await run();
  const ctx = { config: siteConfig, assets: new Proxy({}, { get: (_, k) => `/assets/${String(k)}` }), comments: { provider: 'none' }, builtAt: TEST_NOW, stats: data };
  const arsenal = data.previews.find((p) => p.slug.endsWith('arsenal'));
  const html = previewPage(ctx, arsenal);
  const snippet = html.slice(html.indexOf('id="tbl-h"'), html.indexOf('Full table'));
  assert.ok(!/<tr class="[^"]*z-down/.test(snippet) && /<tr class="[^"]*"/.test(snippet), 'mid-table clubs not shown as relegated');
  const broken = structuredClone(arsenal);
  broken.date = undefined; broken.h2h[0].date = 'not a date'; broken.form.home[0].date = null;
  assert.doesNotThrow(() => previewPage(ctx, broken));
  const d2 = structuredClone(data); d2.results[0].date = ''; d2.updated = null;
  assert.doesNotThrow(() => statsPage({ ...ctx, stats: d2 }));
  assert.match(html, /Injury and suspension news from the Premier League \(official Fantasy Premier League data\), refreshed/, 'two Premier League clubs: FPL only');
  assert.match(html, /50% chance/);
  assert.match(html, /\(news from 23 Oct\)/);
  const rma = previewPage(ctx, data.previews[1]);
  assert.match(rma, /from the Premier League \(official Fantasy Premier League data\), ESPN and API-Football/);
});

test('team news: FPL down or mid-update: last good list for up to 3 days, then ESPN and API-Football', async () => {
  const { fplState } = await import('./fixtures/stats-fixtures.mjs');
  const cache = {};
  await run({}, KEYS, cache); // a good build remembers FPL's list
  assert.ok(cache.fpl?.list?.length > 5 && !JSON.stringify(cache.fpl).includes('Salah'), 'only players with news are kept');
  try {
    fplState.mode = 'updating';
    let r = await run({}, KEYS, cache);
    assert.equal(r.data.previews[0].out.home[1].name, 'Giovanni Leoni', 'remembered list used while the game is updating');
    assert.match(r.data.sources.find((x) => /Fantasy/.test(x.name)).detail, /being updated/);
    // more than 3 days old: fall back to ESPN + API-Football
    cache.fpl.t = new Date(TEST_NOW - 4 * 86400000).toISOString();
    fplState.mode = 'down';
    r = await run({}, KEYS, cache);
    const bri = r.data.previews[0];
    assert.deepEqual(bri.out.home.map((o) => o.name), ['Dominik Szoboszlai'], 'ESPN + API-Football, "D. Szoboszlai" recognised');
    assert.deepEqual(bri.out.away.map((o) => [o.name, o.why]), [['Solly March', 'Out'], ['Danny Welbeck', 'Doubtful'], ['Kaoru Mitoma', 'Doubtful']]);
    assert.ok(!bri.out.home.some((o) => o.name === 'Victor Munoz'), 'day-to-day players are not listed as out');
    assert.equal(r.data.sources.find((x) => /Fantasy/.test(x.name)).ok, false);
    const ctx = { config: siteConfig, assets: new Proxy({}, { get: (_, k) => `/assets/${String(k)}` }), comments: { provider: 'none' }, builtAt: TEST_NOW, stats: r.data };
    assert.match(previewPage(ctx, bri), /news from ESPN and API-Football, refreshed/);
    assert.match(previewPage(ctx, r.data.previews.find((p) => p.slug.endsWith('arsenal'))), /news from ESPN, refreshed/, 'API-Football not credited when it supplied nothing for this match');
  } finally { fplState.mode = 'ok'; }
});

test('team news: FPL statuses, names and competitions', async () => {
  const { slimFpl, fplOut, nameFor } = await import('../lib/stats/fpl.mjs');
  const { FPL } = await import('./fixtures/stats-fixtures.mjs');
  const fpl = slimFpl(FPL);
  assert.throws(() => slimFpl({ elements: [] }), /unexpected/);
  assert.equal(fplOut(fpl, { name: 'Villarreal' }), null, 'not a Premier League club');
  assert.equal(fplOut(fpl, { name: 'Aston Villa' }).length, 0);
  assert.equal(fplOut(fpl, { name: 'Arsenal', shortName: 'Arsenal' })[0].name, 'Bukayo Saka');
  const ucl = fplOut(fpl, { name: 'Liverpool' }, { league: 'UEFA Champions League' });
  assert.ok(!ucl.some((o) => o.why === 'Suspended'), 'a Premier League ban does not count in Europe');
  assert.equal(nameFor({ first: 'Alisson', second: 'Ramses Becker', web: 'Alisson' }, ['Alisson Becker', 'Becker']), 'Alisson Becker');
  assert.equal(nameFor({ first: 'Víctor', second: 'Muñoz', web: 'Muñoz' }, ['Victor Munoz']), 'Victor Munoz');
  assert.equal(nameFor({ first: 'Rhys', second: 'Williams', web: 'R.Williams' }, ['Neco Williams']), 'Rhys Williams', 'a shared surname is not enough');
  // edge cases: 0% doubtful = out; unavailable for personal reasons is shown, transfers aren't; "not eligible" only in the league
  const odd = slimFpl({ teams: FPL.teams, elements: [
    { team: 14, first_name: 'A', second_name: 'Zero', web_name: 'Zero', status: 'd', news: 'Knock - 0% chance of playing', chance_of_playing_next_round: 0 },
    { team: 14, first_name: 'B', second_name: 'Away', web_name: 'Away', status: 'u', news: 'Personal reasons' },
    { team: 14, first_name: 'C', second_name: 'Gone', web_name: 'Gone', status: 'u', news: 'Has left the club permanently' },
    { team: 14, first_name: 'D', second_name: 'Loanee', web_name: 'Loanee', status: 'n', news: 'Ineligible to face parent club' },
  ] });
  assert.deepEqual(fplOut(odd, { name: 'Liverpool' }).map((o) => [o.name, o.why]), [['A Zero', 'Out'], ['D Loanee', 'Not eligible'], ['B Away', 'Unavailable']]);
  assert.deepEqual(fplOut(odd, { name: 'Liverpool' }, { league: 'FA Cup' }).map((o) => o.name), ['A Zero', 'B Away']);
});

test('review fixes: rebuild while a match was still going', () => {
  const feed = { count: 1, signature: 's', latestGuid: 'g' };
  const st = (builtAt) => ({ signature: 's', latestGuid: 'g', nextKickoff: '2026-10-30T19:45:00Z', inPlay: '2026-10-28T19:45:00Z', builtAt });
  const now = (iso) => ({ now: new Date(iso) });
  assert.equal(decideRebuild(st('2026-10-28T22:00:00Z'), feed, now('2026-10-28T22:30:00Z')).rebuild, false, 'not within 45 minutes');
  assert.match(decideRebuild(st('2026-10-28T22:00:00Z'), feed, now('2026-10-28T22:50:00Z')).reason, /still going/);
  assert.equal(decideRebuild(st('2026-10-28T22:00:00Z'), feed, now('2026-10-28T22:50:00Z')).rebuild, true);
  assert.equal(decideRebuild(st('2026-10-28T22:00:00Z'), feed, now('2026-10-29T01:05:00Z')).rebuild, false, 'after 4 h only in a slot');
  assert.equal(decideRebuild(st('2026-10-28T22:00:00Z'), feed, now('2026-10-29T03:05:00Z')).rebuild, true);
  assert.equal(decideRebuild(st('2026-10-29T03:05:00Z'), feed, now('2026-10-29T06:05:00Z')).rebuild, false, 'built after it must have finished: stop');
});
