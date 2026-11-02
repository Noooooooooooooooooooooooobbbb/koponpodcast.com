// The live match centre: reading ESPN's match data, choosing the match, wording, timing
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventKind, liveSummary, pickMatch, liveNow, matchStats, _resetLiveCache, compName } from '../lib/live.mjs';
import { handleLive, cacheSeconds } from '../netlify/functions/live.mjs';
import { describe as say, feedHtml, withHalfTimeScore, pollSeconds, parseKickoffs, inMatchWindow, clockLabel } from '../src/assets/live-core.js';
import { FULL, snapshot, liveFetch, LIVE_EVENT, LIVE_KICKOFF } from './fixtures/live-fixtures.mjs';
import { formationSlots } from '../src/assets/fans-core.js';

const MIN = 60000;
const K = (type, text, extra = {}) => ({ type: { type, text }, ...extra });

test('live: every kind of moment is recognised; injury stoppages are left out', () => {
  assert.equal(eventKind(K('goal', 'Goal', { scoringPlay: true })), 'goal');
  assert.equal(eventKind(K('goal---header', 'Goal - Header', { scoringPlay: true })), 'goal');
  assert.equal(eventKind(K('penalty---scored', 'Penalty - Scored', { scoringPlay: true })), 'pen-goal');
  assert.equal(eventKind(K('own-goal', 'Own Goal', { scoringPlay: true })), 'own-goal');
  assert.equal(eventKind(K('penalty---saved', 'Penalty - Saved')), 'pen-miss');
  assert.equal(eventKind(K('penalty---missed', 'Penalty - Missed')), 'pen-miss');
  assert.equal(eventKind(K('yellow-card', 'Yellow Card')), 'yellow');
  assert.equal(eventKind(K('red-card', 'Red Card')), 'red');
  assert.equal(eventKind(K('yellow-red-card', 'Second Yellow Card')), 'second-yellow');
  assert.equal(eventKind(K('substitution', 'Substitution')), 'sub');
  assert.equal(eventKind(K('var', 'VAR - Goal Disallowed')), 'var');
  assert.equal(eventKind(K('kickoff', 'Kickoff')), 'kickoff');
  assert.equal(eventKind(K('halftime', 'Halftime')), 'ht');
  assert.equal(eventKind(K('start-2nd-half', 'Start 2nd Half')), '2h');
  assert.equal(eventKind(K('end-regular-time', 'End Regular Time')), 'end-90');
  assert.equal(eventKind(K('start-extra-time', 'Start Extra Time')), 'et');
  assert.equal(eventKind(K('halftime-extra-time', 'Halftime Extra Time')), 'et-ht');
  assert.equal(eventKind(K('start-2nd-half-extra-time', 'Start 2nd Half Extra Time')), 'et-2h');
  assert.equal(eventKind(K('end-extra-time', 'End Extra Time')), 'end-et');
  assert.equal(eventKind(K('start-shootout', 'Start Shootout')), 'shootout');
  assert.equal(eventKind(K('end-match', 'End Match')), 'end');
  assert.equal(eventKind(K('penalty---hit-woodwork', 'Penalty - Hit Woodwork')), 'pen-miss');
  assert.equal(eventKind(K('start-delay', 'Start Delay')), null);
  assert.equal(eventKind(K('end-delay', 'End Delay')), null);
  assert.equal(eventKind(K('something-new', 'Something New')), null, 'unknown kinds are skipped, not shown wrongly');
  assert.equal(compName('English Premier League'), 'Premier League');
  assert.equal(compName('UEFA Champions League'), 'Champions League');
});

test('live: the real Liverpool 0–1 Arsenal, as the page receives it', () => {
  const L = liveSummary(FULL, { id: '1', league: 'English Premier League' });
  assert.equal(L.state, 'post'); assert.equal(L.detail, 'FT'); assert.equal(L.comp, 'Premier League'); assert.equal(L.venue, 'Anfield');
  assert.deepEqual([L.home.name, L.home.score, L.away.score, L.away.name], ['Liverpool', 0, 1, 'Arsenal']);
  const goal = L.events.find((e) => e.kind === 'goal');
  assert.deepEqual([goal.min, goal.team, goal.player, goal.assist, goal.score], ["16'", 'away', 'Kai Havertz', 'Declan Rice', [0, 1]]);
  assert.equal(L.events.filter((e) => e.kind === 'sub').length, 9);
  const s = L.events.find((e) => e.kind === 'sub');
  assert.deepEqual([s.min, s.on, s.off, s.team], ["59'", 'Dominik Szoboszlai', 'Trey Nyoni', 'home']);
  assert.equal(L.events.filter((e) => e.kind === 'yellow').length, 8);
  assert.ok(L.events.some((e) => e.min === "45+2'"), 'added time shown as 45+2\'');
  assert.ok(!L.events.some((e) => e.kind == null), 'injury stoppages left out');
  const st = Object.fromEntries(L.stats.map((r) => [r.key, [r.home, r.away]]));
  assert.deepEqual(st.possessionPct, [56, 44]); assert.deepEqual(st.passPct, [82, 73], 'pass accuracy from the passes, not ESPN\'s rounded 0.8');
  assert.deepEqual(st.shotsOnTarget, [0, 3]);
  // line-ups: in the pitch's position order for the formation
  const lu = L.lineups.home;
  assert.equal(lu.formation, '4-2-3-1'); assert.equal(lu.xi.length, 11); assert.equal(lu.subs.length, 9);
  const slots = formationSlots(lu.formation);
  assert.deepEqual([slots[0].role, lu.xi[0].name], ['GK', 'Alisson Becker']);
  assert.deepEqual([slots[10].role, lu.xi[10].name], ['ST', 'Alexander Isak']);
  const kerkez = lu.xi.find((p) => p.name === 'Milos Kerkez');
  assert.deepEqual([kerkez.yellow, kerkez.off], ["67'", "81'"], 'booked and substituted');
  assert.equal(lu.subs[0].name, 'Dominik Szoboszlai'); assert.equal(lu.subs[0].on, "59'");
  assert.ok(lu.subs.slice(-4).every((p) => !p.on), 'unused subs listed last');
  assert.deepEqual(L.lineups.away.xi.find((p) => p.name === 'Kai Havertz').goals, ["16'"]);
});

test('live: own goals and scores that don\'t add up', () => {
  const mk = (ogTeam, scoreH, scoreA) => ({
    header: { competitions: [{ status: { type: { state: 'in', shortDetail: "50'" } }, competitors: [{ homeAway: 'home', score: String(scoreH), team: { id: '1', displayName: 'Liverpool' } }, { homeAway: 'away', score: String(scoreA), team: { id: '2', displayName: 'Everton' } }] }] },
    keyEvents: [
      { id: 'a', type: { type: 'goal', text: 'Goal' }, scoringPlay: true, clock: { displayValue: "10'" }, team: { id: '1' }, participants: [{ athlete: { displayName: 'Mo Salah' } }] },
      { id: 'b', type: { type: 'own-goal', text: 'Own Goal' }, scoringPlay: true, clock: { displayValue: "30'" }, team: { id: ogTeam }, participants: [{ athlete: { displayName: 'James Tarkowski' } }] },
    ],
  });
  // ESPN lists the own goal under the team that benefits…
  let L = liveSummary(mk('1', 2, 0));
  assert.deepEqual(L.events.map((e) => e.score), [[1, 0], [2, 0]]); assert.equal(L.events[1].for, 'home');
  // …or under the player's own team: both read correctly
  L = liveSummary(mk('2', 2, 0));
  assert.deepEqual(L.events.map((e) => e.score), [[1, 0], [2, 0]]); assert.equal(L.events[1].for, 'home');
  // the goals don't match the score (a goal missing from the feed): no running scores shown
  L = liveSummary(mk('1', 3, 0));
  assert.ok(L.events.every((e) => e.score === undefined));
  assert.equal(L.home.score, 3, 'the real score still shows');
});

test('live: before kick-off nothing is invented; stats appear once they mean something', () => {
  const pre = liveSummary(snapshot(-30 * MIN), LIVE_EVENT);
  assert.equal(pre.state, 'pre'); assert.equal(pre.events.length, 0); assert.deepEqual(pre.stats, []);
  assert.equal(pre.home.score, null, 'no 0–0 before kick-off');
  assert.equal(pre.lineups.home.xi.length, 11, 'line-ups are in an hour before');
  assert.ok(pre.lineups.home.subs.every((p) => !p.on));
  assert.deepEqual(matchStats({}, '1', '2'), []);
});

test('live: the replayed match, minute by minute', () => {
  const at = (m) => liveSummary(snapshot(m * MIN), LIVE_EVENT);
  let L = at(20.5);
  assert.deepEqual([L.state, L.detail, L.home.score, L.away.score], ['in', "21'", 0, 1]);
  assert.equal(clockLabel(L), "21'");
  L = at(55);
  assert.equal(clockLabel(L), 'HT'); assert.ok(L.halftime);
  L = at(47.5);
  assert.equal(clockLabel(L), "45+3'");
  L = at(100);
  assert.equal(clockLabel(L), "82'");
  assert.equal(L.lineups.home.subs.filter((p) => p.on).length, 5);
  L = at(130);
  assert.deepEqual([L.state, clockLabel(L)], ['post', 'FT']);
});

test('live: which match to show', () => {
  const now = new Date('2026-11-08T17:00:00Z');
  const e = (id, date, extra = {}) => ({ id, date, ...extra });
  assert.equal(pickMatch({ live: [e('L', '2026-11-08T16:00Z')], upcoming: [e('U', '2026-11-08T17:30Z')] }, now).id, 'L', 'one in progress comes first');
  assert.equal(pickMatch({ upcoming: [e('U', '2026-11-08T17:30Z')] }, now).id, 'U', '30 min before');
  assert.equal(pickMatch({ upcoming: [e('U', '2026-11-08T18:30Z')] }, now), null, 'more than 75 min before: not yet');
  assert.equal(pickMatch({ past: [e('P', '2026-11-08T13:30Z')] }, now).id, 'P', '3½ h after kick-off: still the latest result');
  assert.equal(pickMatch({ past: [e('P', '2026-11-08T12:30Z')] }, now), null, 'over 4 h ago: done');
  assert.equal(pickMatch({ upcoming: [e('T', '2026-11-08T17:30Z', { tbc: true })] }, now), null, 'time not confirmed: never guessed');
  assert.equal(pickMatch({ upcoming: [e('X', '2026-11-08T17:30Z', { postponed: true })] }, now), null);
});

test('live: /api/live through a whole match, cached for everyone, and calm when ESPN is down', async () => {
  const call = async (mins) => {
    _resetLiveCache();
    const now = new Date(LIVE_KICKOFF + mins * MIN);
    const r = await handleLive(new Request('http://x/api/live'), { fetchImpl: liveFetch(() => now), now });
    return { j: await r.json(), cdn: r.headers.get('netlify-cdn-cache-control'), cc: r.headers.get('cache-control') };
  };
  let r = await call(-200);
  assert.equal(r.j.state, 'none'); assert.equal(r.j.next.away.short, 'Arsenal'); assert.match(r.cdn, /s-maxage=300/);
  r = await call(-30);
  assert.equal(r.j.state, 'pre'); assert.match(r.cdn, /durable, s-maxage=60/);
  r = await call(20.5);
  assert.deepEqual([r.j.state, r.j.away.score], ['in', 1]); assert.match(r.cdn, /s-maxage=20/); assert.match(r.cc, /max-age=0/);
  assert.equal(r.j.comp, 'Premier League');
  r = await call(130);
  assert.equal(r.j.state, 'post'); assert.match(r.cdn, /s-maxage=120/);
  // ESPN down: a calm message, cached briefly
  _resetLiveCache();
  const down = await handleLive(new Request('http://x/api/live'), { fetchImpl: async () => new Response('nope', { status: 503 }), now: new Date() });
  const dj = await down.json();
  assert.equal(dj.state, 'error'); assert.match(down.headers.get('netlify-cdn-cache-control'), /s-maxage=30/);
  assert.equal(down.status, 200);
  assert.equal(cacheSeconds({ state: 'in' }), 20);
});

test('live: the match is remembered for 10 minutes, so ESPN\'s schedule isn\'t asked every time', async () => {
  _resetLiveCache();
  const urls = [];
  const base = liveFetch(() => now);
  const spy = async (u, i) => { urls.push(String(u)); return base(u, i); };
  let now = new Date(LIVE_KICKOFF + 20 * MIN);
  await liveNow({ fetchImpl: spy, now });
  const first = urls.filter((u) => /schedule/.test(u)).length;
  now = new Date(LIVE_KICKOFF + 25 * MIN);
  await liveNow({ fetchImpl: spy, now });
  assert.equal(urls.filter((u) => /schedule/.test(u)).length, first, 'no new schedule lookups');
  assert.equal(urls.filter((u) => /summary/.test(u)).length, 2);
});

test('live: the action in our own words, newest first, safe from odd names', () => {
  const m = withHalfTimeScore(liveSummary(FULL, LIVE_EVENT));
  const by = (k) => m.events.find((e) => e.kind === k);
  assert.deepEqual(say(by('goal'), m), { title: 'GOAL!', text: 'Kai Havertz (Arsenal), set up by Declan Rice. Liverpool 0–1 Arsenal' });
  assert.deepEqual(say(by('sub'), m), { title: 'Substitution, Liverpool', text: 'Dominik Szoboszlai comes on for Trey Nyoni.' });
  assert.deepEqual(say(by('yellow'), m), { title: 'Yellow card', text: 'Bradley Barcola (Liverpool)' });
  assert.deepEqual(say(by('ht'), m), { title: 'Half-time', text: 'Liverpool 0–1 Arsenal' });
  assert.deepEqual(say(by('end-90'), m), { title: 'Full time', text: 'Liverpool 0–1 Arsenal' });
  assert.equal(say({ kind: 'red', team: 'home', player: 'X' }, m).text, 'X (Liverpool) is sent off.');
  assert.equal(say({ kind: 'var', note: 'goal disallowed' }, m).text, 'Goal disallowed.');
  const html = feedHtml(m, { ours: 'home', fresh: new Set([by('goal').id]) });
  assert.ok(html.indexOf('Full time') < html.indexOf('Kick-off'), 'newest first');
  assert.match(html, /class="lv-ev lv-goal lv-big is-new"/, 'the new goal is highlighted (not ours: no red)');
  const evil = { ...m, events: [{ id: '1', kind: 'goal', team: 'home', player: '<img src=x onerror=alert(1)>', min: "1'" }] };
  assert.ok(!feedHtml(evil).includes('<img src=x'), 'names are escaped');
  assert.match(feedHtml({ ...m, events: [], state: 'pre' }), /from kick-off/);
});

test('live: when to check, and the LIVE strip\'s match windows (UK dates)', () => {
  assert.deepEqual([pollSeconds('in'), pollSeconds('pre'), pollSeconds('post'), pollSeconds('none'), pollSeconds('error')], [30, 60, 120, 300, 45]);
  const ks = parseKickoffs('2026-11-08T17:30Z, d:2026-11-12, junk');
  assert.equal(ks.length, 2);
  const t = Date.parse('2026-11-08T17:30Z');
  assert.ok(!inMatchWindow(ks, t - 80 * MIN)); assert.ok(inMatchWindow(ks, t - 70 * MIN)); assert.ok(inMatchWindow(ks, t + 3.9 * 3600000)); assert.ok(!inMatchWindow(ks, t + 4.1 * 3600000));
  assert.ok(inMatchWindow(ks, Date.parse('2026-11-12T23:30:00Z')), 'a date-only fixture: all of that UK day');
  assert.ok(!inMatchWindow(ks, Date.parse('2026-11-13T00:30:00Z')));
  assert.ok(inMatchWindow(parseKickoffs('d:2026-07-12'), Date.parse('2026-07-11T23:30:00Z')), 'UK summer time: 00:30 BST is already the 12th');
});

test('live: a penalty shoot-out is shown, but its kicks are not counted as goals', () => {
  const sum = {
    header: { competitions: [{ status: { type: { state: 'post', shortDetail: 'FT-Pens' } }, competitors: [{ homeAway: 'home', score: '1', shootoutScore: 4, team: { id: '1', displayName: 'Liverpool' } }, { homeAway: 'away', score: '1', shootoutScore: 3, team: { id: '2', displayName: 'Chelsea' } }] }] },
    keyEvents: [
      { id: 'g1', type: { type: 'goal', text: 'Goal' }, scoringPlay: true, clock: { displayValue: "10'" }, team: { id: '1' }, participants: [{ athlete: { displayName: 'Mo Salah' } }] },
      { id: 'g2', type: { type: 'goal', text: 'Goal' }, scoringPlay: true, clock: { displayValue: "80'" }, team: { id: '2' }, participants: [{ athlete: { displayName: 'Cole Palmer' } }] },
      { id: 's1', type: { type: 'penalty---scored', text: 'Penalty - Scored' }, scoringPlay: true, shootout: true, team: { id: '1' }, participants: [{ athlete: { displayName: 'Mo Salah' } }] },
      { id: 's2', type: { type: 'penalty---saved', text: 'Penalty - Saved' }, shootout: true, team: { id: '2' }, participants: [{ athlete: { displayName: 'Cole Palmer' } }] },
    ],
  };
  const L = liveSummary(sum);
  assert.deepEqual(L.events.map((e) => e.kind), ['goal', 'goal', 'so-goal', 'so-miss']);
  assert.deepEqual(L.events[1].score, [1, 1], 'running score still adds up (shoot-out kicks not counted)');
  assert.deepEqual(L.pens, [4, 3]);
  assert.equal(say(L.events[3], L).text, 'Cole Palmer (Chelsea) misses.');
});

// Real matches with the awkward cases (trimmed ESPN data, facts only)
import { readFileSync as _rf } from 'node:fs';
import { clockWords } from '../src/assets/live-core.js';
const CASES = JSON.parse(_rf(new URL('./fixtures/live-cases.json', import.meta.url), 'utf8'));
const lines = (m) => m.events.filter((e) => !['sub', 'yellow'].includes(e.kind)).map((e) => { const d = say(e, m); return `${e.min} ${d.title}: ${d.text}`.trim(); });

test('live (real matches): an own goal names the player\'s own club; the woodwork penalty is shown', () => {
  let m = withHalfTimeScore(liveSummary(CASES.ownGoal));
  assert.ok(lines(m).includes("82' Own goal: Axel Disasi (West Ham) puts it into his own net. Liverpool 5–2 West Ham"));
  assert.deepEqual(m.lineups.away, null, 'no line-ups in this trimmed copy: handled');
  m = withHalfTimeScore(liveSummary(CASES.woodwork));
  assert.ok(lines(m).includes("32' Penalty missed: Dominik Szoboszlai (Liverpool) fails to score from the spot."));
  assert.equal(eventKind({ type: { type: 'penalty---awarded', text: 'Penalty - Awarded' } }), null, 'an awarded penalty is not a miss');
});

test('live (real matches): extra time, with the score at each whistle', () => {
  const m = withHalfTimeScore(liveSummary(CASES.et));
  const L = lines(m);
  assert.ok(L.includes("90+5' End of normal time: West Ham 1–1 QPR"), 'the score then, not the final score');
  assert.ok(L.includes("105+3' Extra-time break: West Ham 2–1 QPR"));
  assert.ok(L.includes("105' Extra time: The second half of extra time is under way."));
  assert.ok(L.includes("120+2' Full time, after extra time: West Ham 2–1 QPR"));
  assert.equal(L.filter((x) => /Full time/.test(x)).length, 1, 'one full-time line');
  assert.equal(L.filter((x) => /Half-time/.test(x)).length, 1);
  assert.deepEqual([clockLabel(m), clockWords(m)], ['AET', 'After extra time']);
});

test('live (real matches): Liverpool win on penalties', () => {
  const m = withHalfTimeScore(liveSummary(CASES.pens));
  const L = lines(m);
  assert.deepEqual(m.pens, [6, 5]);
  assert.ok(L.includes("90+4' End of normal time: Liverpool 1–1 Chelsea"));
  assert.ok(L.includes("104' Full time, after penalties: Liverpool 1–1 Chelsea. Liverpool win 6–5 on penalties."));
  assert.deepEqual([clockLabel(m), clockWords(m)], ['Pens', 'After penalties']);
});

test('live: an abandoned or postponed match is never shown as a 0–0 result', () => {
  const sum = { header: { competitions: [{ status: { type: { name: 'STATUS_POSTPONED', state: 'post', description: 'Postponed', shortDetail: 'Postponed' } }, competitors: [{ homeAway: 'home', team: { id: '364', displayName: 'Liverpool' } }, { homeAway: 'away', team: { id: '2', displayName: 'Everton' } }] }] }, keyEvents: [] };
  const m = liveSummary(sum);
  assert.equal(m.postponed, true); assert.equal(m.home.score, null); assert.equal(clockLabel(m), 'Postponed');
  // extra-time break while it's happening
  const et = liveSummary({ header: { competitions: [{ status: { period: 3, displayClock: "105'", type: { name: 'STATUS_HALFTIME_ET', state: 'in', description: 'Halftime Extra Time', shortDetail: 'HT-ET' } }, competitors: [{ homeAway: 'home', score: '1', team: { id: '1' } }, { homeAway: 'away', score: '1', team: { id: '2' } }] }] } });
  assert.deepEqual([clockLabel(et), clockWords(et)], ['ET HT', 'Extra-time break']);
});

test('live: pages built during or just after a match still carry its kick-off (the LIVE strip stays)', async () => {
  const { layout } = await import('../src/templates.mjs');
  const { default: config } = await import('../site.config.mjs');
  const assets = new Proxy({}, { get: (_, k) => `/assets/${String(k)}` });
  const ctx = (builtAt, stats) => ({ config, assets, comments: { provider: 'none' }, builtAt: new Date(builtAt), stats });
  const meta = (html) => (html.match(/name="kopon-kickoffs" content="([^"]*)"/) || [])[1] || '';
  const next = [{ date: '2026-11-12T19:45Z' }, { date: '2026-11-15T15:00Z', tbc: true }];
  // built at 18:15, 45 min into a match: it's no longer "upcoming"
  let html = layout(ctx('2026-11-08T18:15:00Z', { inPlay: '2026-11-08T17:30Z', results: [], next }), { path: '/x/', title: 'X' }, '');
  assert.equal(meta(html), '2026-11-08T17:30Z,2026-11-12T19:45Z,d:2026-11-15');
  assert.match(html, /live-strip\.js/);
  // built after the final whistle: the result stays in the list for 4 hours after kick-off
  html = layout(ctx('2026-11-08T19:45:00Z', { results: [{ date: '2026-11-08T17:30Z' }, { date: '2026-11-01T16:30Z' }], next: [] }), { path: '/x/', title: 'X' }, '');
  assert.equal(meta(html), '2026-11-08T17:30Z', 'the result, but not last week\'s');
  html = layout(ctx('2026-11-08T22:00:00Z', { results: [{ date: '2026-11-08T17:30Z' }], next: [] }), { path: '/x/', title: 'X' }, '');
  assert.equal(meta(html), '', 'over 4 hours later: no strip at all');
  assert.doesNotMatch(html, /live-strip\.js/);
});
