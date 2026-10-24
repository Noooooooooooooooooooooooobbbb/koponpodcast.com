import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FORMATIONS, formationSlots, fansXI, cleanLineupVote, cleanRatingsVote,
  emptyLineupAgg, addLineupVote, emptyRatingsAgg, addRatingsVote, ratingsTable, motmWinner, ratingColor,
} from '../src/assets/fans-core.js';
import { face, chip, esc } from '../src/assets/fans-ui.js';
import { nameScore, clubScore, fotmobPlayers, attachFaces } from '../lib/fans/faces.mjs';
import { orderForFormation, predictedXI, lineupFor, surname, posLetter } from '../lib/fans/build.mjs';
import { fileStore } from '../lib/fans/store.mjs';
import { handleFans, totals } from '../lib/fans/api.mjs';
import { buildStats } from '../lib/stats/index.mjs';
import { statsFetch, TEST_NOW } from './fixtures/stats-fixtures.mjs';
import config from '../site.config.mjs';

const SQUAD = ['gk', 'rb', 'cb1', 'cb2', 'lb', 'm1', 'm2', 'm3', 'rw', 'st', 'lw', 'sub1', 'sub2', 'gk2'];

// ---------------------------------------------------------------- formations
test('every formation has 11 positions: a keeper, then lines from the back', () => {
  for (const f of Object.keys(FORMATIONS)) {
    const s = formationSlots(f);
    assert.equal(s.length, 11, f);
    assert.equal(s[0].role, 'GK');
    assert.equal(s[0].line, 0);
    const outfield = f.split('-').map(Number);
    assert.equal(s.filter((x) => x.line === 1).length, outfield[0], `${f} defenders`);
    assert.equal(s.filter((x) => x.line === 3).length, outfield[outfield.length - 1], `${f} forwards`);
    for (const x of s) { assert.ok(x.x > 0 && x.x < 1 && x.y > 0 && x.y < 1, `${f} ${x.role} on the pitch`); }
    // the team's right is on the right of the picture
    const backs = s.filter((x) => x.line === 1);
    assert.ok(backs[0].x > backs[backs.length - 1].x, `${f} right back on the right`);
  }
  assert.deepEqual(formationSlots('4-2-3-1').map((x) => x.role), ['GK', 'RB', 'RCB', 'LCB', 'LB', 'RDM', 'LDM', 'RW', 'AM', 'LW', 'ST']);
  assert.equal(formationSlots('nonsense').length, 11, 'unknown formation falls back to 4-3-3');
});

// ---------------------------------------------------------------- what visitors can send
test('line-up votes: only 11 different squad players in a listed formation', () => {
  const ok = cleanLineupVote({ formation: '4-3-3', xi: SQUAD.slice(0, 11), captain: 'st', extra: 'ignored' }, SQUAD);
  assert.deepEqual(ok.vote, { formation: '4-3-3', xi: SQUAD.slice(0, 11), captain: 'st' });
  assert.equal(cleanLineupVote({ formation: '4-3-3', xi: SQUAD.slice(0, 11), captain: 'sub1' }, SQUAD).vote.captain, null, 'captain must be in the XI');
  assert.match(cleanLineupVote({ formation: '2-2-6', xi: SQUAD.slice(0, 11) }, SQUAD).error, /formation/);
  assert.match(cleanLineupVote({ formation: '4-3-3', xi: SQUAD.slice(0, 10) }, SQUAD).error, /11/);
  assert.match(cleanLineupVote({ formation: '4-3-3', xi: [...SQUAD.slice(0, 10), 'gk'] }, SQUAD).error, /once/);
  assert.match(cleanLineupVote({ formation: '4-3-3', xi: [...SQUAD.slice(0, 10), 'messi'] }, SQUAD).error, /squad/);
  assert.match(cleanLineupVote({ formation: '4-3-3', xi: [...SQUAD.slice(0, 10), '<script>'] }, SQUAD).error, /squad/);
  assert.match(cleanLineupVote(null, SQUAD).error, /formation/);
  for (const f of ['__proto__', 'constructor', 'toString']) assert.match(cleanLineupVote({ formation: f, xi: SQUAD.slice(0, 11) }, SQUAD).error, /formation/, f);
  assert.equal(formationSlots('constructor').length, 11);
});

test('ratings votes: halves from 1 to 10, players from that match only', () => {
  const r = cleanRatingsVote({ r: { gk: 7.3, rb: '8', cb1: 11, cb2: 0, lb: 'abc', nope: 7, m1: 1 }, motm: 'rb' }, SQUAD);
  assert.deepEqual(r.vote, { r: { gk: 7.5, rb: 8, m1: 1 }, motm: 'rb' });
  assert.equal(cleanRatingsVote({ r: { gk: 7 }, motm: 'nobody' }, SQUAD).vote.motm, null);
  assert.match(cleanRatingsVote({ r: {} }, SQUAD).error, /at least one/);
  assert.match(cleanRatingsVote({ r: { gk: NaN } }, SQUAD).error, /at least one/);
});

// ---------------------------------------------------------------- adding up
test("the fans' XI: most popular formation, most-picked players, placed where fans put them", () => {
  const agg = emptyLineupAgg();
  const base = ['gk', 'rb', 'cb1', 'cb2', 'lb', 'm1', 'm2', 'm3', 'rw', 'st', 'lw'];
  addLineupVote(agg, { formation: '4-3-3', xi: base, captain: 'st' });
  addLineupVote(agg, { formation: '4-3-3', xi: base.map((x) => (x === 'lw' ? 'sub1' : x)), captain: 'st' });
  addLineupVote(agg, { formation: '4-3-3', xi: base, captain: 'cb1' });
  // someone who plays rw on the left and lw on the right: the crowd still wins
  addLineupVote(agg, { formation: '4-4-2', xi: ['gk2', 'rb', 'cb1', 'cb2', 'lb', 'rw', 'm1', 'm2', 'lw', 'st', 'sub2'], captain: null });
  const X = fansXI(agg);
  assert.equal(X.formation, '4-3-3');
  assert.deepEqual(X.xi, base, 'fans XI in the right slots');
  assert.equal(X.pct.gk, 75);
  assert.equal(X.pct.st, 100);
  assert.equal(X.captain, 'st');
  // taking a vote away undoes it exactly
  addLineupVote(agg, { formation: '4-4-2', xi: ['gk2', 'rb', 'cb1', 'cb2', 'lb', 'rw', 'm1', 'm2', 'lw', 'st', 'sub2'], captain: null }, -1);
  assert.equal(agg.n, 3);
  assert.equal(agg.formations['4-4-2'], 0);
  assert.equal(fansXI(emptyLineupAgg()), null);
  // one vote: still a full XI
  const one = addLineupVote(emptyLineupAgg(), { formation: '3-5-2', xi: SQUAD.slice(0, 11), captain: null });
  assert.equal(fansXI(one).xi.filter(Boolean).length, 11);
});

test("ratings: averages, player of the match, Flappy Jim's colours", () => {
  const agg = emptyRatingsAgg();
  addRatingsVote(agg, { r: { gk: 7, st: 9 }, motm: 'st' });
  addRatingsVote(agg, { r: { gk: 8, st: 8 }, motm: 'st' });
  addRatingsVote(agg, { r: { gk: 6.5 }, motm: 'gk' });
  assert.deepEqual(ratingsTable(agg), [{ id: 'st', avg: 8.5, votes: 2 }, { id: 'gk', avg: 7.2, votes: 3 }]);
  assert.deepEqual(motmWinner(agg), { id: 'st', pct: 67 });
  assert.equal(ratingColor(8.2), '#16a34a');
  assert.equal(ratingColor(7), '#65a30d');
  assert.equal(ratingColor(6.4), '#ca8a04');
  assert.equal(ratingColor(5), '#ea580c');
  assert.equal(ratingColor(3), '#dc2626');
});

test('faces and chips escape everything and only show safe pictures', () => {
  const h = face({ name: '<img src=x onerror=alert(1)>', photo: 'javascript:alert(1)' });
  assert.doesNotMatch(h, /<img src=x|javascript:/);
  assert.match(face({ name: 'Virgil van Dijk', photo: 'https://images.fotmob.com/x.png' }), /<span class="face-ini">VD<\/span><img src="https:\/\/images\.fotmob\.com\/x\.png"/);
  assert.match(face({ name: 'Own', photo: '/photos/own.jpg?v=1' }), /src="\/photos\/own\.jpg\?v=1"/);
  assert.doesNotMatch(face({ name: 'x', photo: 'https://a" onerror="alert(1)' }), /onerror="alert/);
  assert.match(chip(7.25), />7\.3</);
  assert.match(chip(null), /rchip-none/);
  assert.equal(esc(`"'<>&`), '&quot;&#39;&lt;&gt;&amp;');
});

// ---------------------------------------------------------------- photos
test('photo name matching never mixes up two players', () => {
  assert.equal(nameScore('Virgil van Dijk', 'Virgil van Dijk'), 3);
  assert.equal(nameScore('Ibrahima Konate', 'Ibrahima Konaté'), 3);
  assert.equal(nameScore('Conor Bradley', 'Bradley Barcola'), 0, 'shares a word, different person');
  assert.equal(nameScore('Joe Gomez', 'Jon Gomez'), 1, 'same initial: weak, needs the club too');
  assert.equal(nameScore('Joe Gomez', 'Andre Gomez'), 0);
  assert.equal(nameScore('Andy Robertson', 'Andrew Robertson'), 1);
  assert.equal(nameScore('M. Salah', 'Mohamed Salah'), 2);
  assert.equal(nameScore('Alisson', 'Alisson Becker'), 1);
  assert.equal(clubScore('Liverpool', 'Liverpool FC'), 2);
  assert.equal(clubScore('Brighton & Hove Albion', 'Brighton'), 2);
  assert.equal(clubScore('Liverpool', 'Everton'), 0);
  assert.deepEqual(fotmobPlayers([{ suggestions: [{ type: 'player', id: '1', name: 'A B', teamName: 'C' }, { type: 'team', id: '2', name: 'Team' }] }]), [{ id: '1', name: 'A B', team: 'C' }]);
});

test('photos: looked up once, remembered, own photos win, failures retried later', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('fotmob.com/api/search')) return new Response(JSON.stringify([{ suggestions: [{ type: 'player', id: '7', name: 'Mo Salah', teamName: 'Liverpool' }] }]));
    if (url.includes('images.fotmob.com')) return new Response(new Uint8Array(5000), { headers: { 'content-type': 'image/png' } });
    return new Response('{}', { status: 404 });
  };
  const cache = {};
  const now = new Date('2026-10-23T12:00:00Z');
  const people = [{ name: 'Mo Salah', club: 'Liverpool' }, { name: 'Nobody Known', club: 'Liverpool' }, { name: 'Own Photo', club: 'Liverpool' }];
  await attachFaces(people, { fetchImpl, cache, own: { 'own-photo': '/photos/own-photo.jpg?v=1' }, now });
  assert.equal(people[0].photo, 'https://images.fotmob.com/image_resources/playerimages/7.png');
  assert.equal(people[1].photo, '');
  assert.equal(people[2].photo, '/photos/own-photo.jpg?v=1');
  const n = calls.length;
  await attachFaces(people.map((p) => ({ ...p, photo: '' })), { fetchImpl, cache, own: { 'own-photo': '/photos/own-photo.jpg?v=1' }, now: new Date('2026-10-24T12:00:00Z') });
  assert.equal(calls.length, n, 'next day: nothing looked up again');
  const again = people.map((p) => ({ name: p.name, club: p.club }));
  await attachFaces(again, { fetchImpl, cache, now: new Date('2026-10-27T12:00:00Z') });
  assert.ok(calls.length > n, 'nobody found: looked up again after 3 days');
  assert.equal(again[0].photo, 'https://images.fotmob.com/image_resources/playerimages/7.png', 'found photo kept');
  // FotMob down: the old photo is kept
  const down = async () => new Response('', { status: 503 });
  const later = [{ name: 'Mo Salah', club: 'Liverpool' }];
  await attachFaces(later, { fetchImpl: down, cache, now: new Date('2026-12-30T12:00:00Z') });
  assert.equal(later[0].photo, 'https://images.fotmob.com/image_resources/playerimages/7.png');
});

// ---------------------------------------------------------------- line-ups from ESPN
test('ESPN line-ups go into the right formation positions; predicted XI swaps the injured', async () => {
  assert.equal(surname('Virgil van Dijk'), 'van Dijk');
  assert.equal(surname('Alexis Mac Allister'), 'Mac Allister');
  assert.equal(posLetter('CD-L'), 'D');
  assert.equal(posLetter('Goalkeeper'), 'G');
  const P = (name, pos) => ({ name, pos });
  const xi = [P('St', 'CF'), P('Gk', 'G'), P('Lb', 'LB'), P('Rb', 'RB'), P('Lcb', 'CD-L'), P('Rcb', 'CD-R'), P('Dm', 'DM'), P('Lcm', 'CM-L'), P('Rcm', 'CM-R'), P('Lw', 'LW'), P('Rw', 'RW')];
  assert.deepEqual(orderForFormation(xi, '4-3-3').map((p) => p.name), ['Gk', 'Rb', 'Rcb', 'Lcb', 'Lb', 'Rcm', 'Dm', 'Lcm', 'Rw', 'St', 'Lw']);
  const sum = { rosters: [{ team: { id: '9' }, formation: '4-3-3', roster: [...xi.map((p, i) => ({ athlete: { displayName: p.name }, jersey: String(i + 1), position: { abbreviation: p.pos }, starter: true, formationPlace: String(i + 1) })), { athlete: { displayName: 'Sub Fb' }, position: { abbreviation: 'LB' }, starter: false, subbedIn: true }, { athlete: { displayName: 'Sub Gk' }, position: { abbreviation: 'G' }, starter: false }] }] };
  const lu = lineupFor(sum, '9');
  assert.equal(lu.xi.length, 11);
  assert.equal(lu.formation, '4-3-3');
  const espn = { get: async () => sum };
  const fixtures = { past: [{ id: '1', done: true, slug: 'eng.1', league: 'Premier League', date: '2026-10-18T14:00Z', home: { id: '9', name: 'Them' }, away: { id: '8', name: 'Others', shortName: 'Others' } }] };
  const pred = await predictedXI(espn, { id: '9', name: 'Them' }, fixtures, [{ name: 'Lb', why: 'Out', detail: 'Knee' }, { name: 'St', why: 'Doubtful' }], { league: 'Premier League' });
  assert.equal(pred.xi.length, 11);
  const lbSlot = pred.xi[4];
  assert.equal(lbSlot.name, 'Sub Fb');
  assert.equal(lbSlot.predicted, true);
  assert.ok(pred.xi.some((p) => p.name === 'St'), 'doubtful players are kept');
  assert.deepEqual(pred.changes, [{ out: 'Lb', why: 'Out', detail: 'Knee', in: 'Sub Fb' }]);
  assert.equal(pred.basedOn.opp, 'Others');
  assert.equal(await predictedXI(espn, { id: '7' }, fixtures, [], null), null, 'no line-up: no prediction');
});

test('the stats build makes the fan zone (squad, last XI, opposition XI, matches to rate, photos)', async () => {
  const cache = {};
  const { data } = await buildStats({ fetchImpl: statsFetch(), env: {}, config, now: TEST_NOW, cache });
  const F = data.fans;
  assert.ok(F, 'fan zone built');
  assert.equal(F.squad.length, 22);
  assert.equal(new Set(F.squad.map((p) => p.id)).size, 22, 'ids unique');
  assert.deepEqual(F.squad.slice(0, 3).map((p) => p.letter), ['G', 'G', 'G'], 'keepers first');
  const vvd = F.squad.find((p) => p.id === 'virgil-van-dijk');
  assert.equal(vvd.num, '4'); assert.equal(vvd.short, 'van Dijk'); assert.match(vvd.flag, /^https:\/\//); assert.match(vvd.photo, /images\.fotmob\.com.*33004\.png$/);
  assert.equal(F.squad.find((p) => p.id === 'conor-bradley').photo, '', 'no wrong face for a player FotMob has no match for');
  assert.match(F.squad.find((p) => p.id === 'curtis-jones').photo, /upload\.wikimedia\.org/, "FotMob's blank silhouette is skipped for Wikipedia");
  assert.deepEqual(F.squad.find((p) => p.id === 'dominik-szoboszlai').out, { why: 'Out', detail: 'Hamstring' });
  const L = F.lineup;
  assert.equal(L.opp.shortName, 'Brighton');
  assert.equal(L.kickoff, '2026-10-25T14:00Z');
  assert.equal(L.lastXI.xi.length, 11);
  assert.equal(L.lastXI.vs, 'Villarreal');
  assert.ok(L.lastXI.xi.every((id) => F.squad.some((p) => p.id === id)), 'last XI uses squad ids');
  assert.equal(L.lastXI.xi[0], 'alisson-becker');
  assert.equal(L.oppXI.formation, '4-2-3-1');
  assert.equal(L.oppXI.xi.length, 11);
  assert.ok(!L.oppXI.xi.some((p) => p.name === 'Solly March'), 'injured player swapped out');
  assert.equal(L.oppXI.changes[0].out, 'Solly March');
  assert.match(L.oppXI.xi.find((p) => p.name === 'Kaoru Mitoma').photo, /44022/);
  assert.equal(F.rate.length, 5);
  const m = F.rate[0];
  assert.equal(m.opp.shortName, 'Villarreal');
  assert.equal(m.gf, 4); assert.equal(m.ga, 3); assert.equal(m.r, 'W');
  assert.equal(m.players.filter((p) => p.starter).length, 11);
  assert.ok(m.players.some((p) => !p.starter), 'subs who came on are included');
  assert.ok(!m.players.some((p) => p.name === 'Giorgi Mamardashvili'), "unused subs aren't");
  assert.ok(m.players.every((p) => p.stat >= 3 && p.stat <= 10));
  assert.equal(Date.parse(m.closes) - Date.parse(m.date), 7 * 86400000);
  // a second build reuses everything it can
  const calls = [];
  const f2 = statsFetch();
  const counting = async (u, i) => { calls.push(String(u)); return f2(u, i); };
  const r2 = await buildStats({ fetchImpl: counting, env: {}, config, now: TEST_NOW, cache });
  assert.equal(r2.data.fans.rate.length, 5);
  assert.equal(calls.filter((u) => /fotmob|wikipedia|thesportsdb/.test(u)).length, 0, 'no photo lookups the second time');
  assert.ok(calls.filter((u) => /summary/.test(u)).length < 12, 'finished matches not fetched again');
});

test('the fan zone failing never stops the stats', async () => {
  const f = statsFetch();
  const broken = async (u, i) => (/roster|summary/.test(String(u)) ? new Response('x', { status: 500 }) : f(u, i));
  const { data } = await buildStats({ fetchImpl: broken, env: {}, config, now: TEST_NOW, cache: {} });
  assert.equal(data.fans, null);
  assert.ok(data.sources.some((s) => /Fan zone/.test(s.name) && !s.ok));
  assert.ok(data.next.length > 0);
});

// ---------------------------------------------------------------- the voting function
const CFG = {
  lineup: { matchId: '700090', closes: '2026-10-25T14:00Z', squad: SQUAD },
  rate: [{ matchId: '700083', kickoff: '2026-10-21T19:00:00Z', closes: '2026-10-28T19:00:00.000Z', players: SQUAD.slice(0, 13) }],
};
const NOW = new Date('2026-10-24T12:00:00Z');
const post = (body, ip = '1.2.3.4') => new Request('https://koponpodcast.com/api/fans', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const get = (q) => new Request(`https://koponpodcast.com/api/fans?${q}`);
const V = (n) => `voter-${String(n).padStart(12, '0')}`;

async function withStore(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'fans-'));
  try { await fn(fileStore(dir, 'kopon-fans')); } finally { await rm(dir, { recursive: true, force: true }); }
}
const call = async (store, req, { now = NOW, env = { EDITOR_PASSWORD: 'correct horse' }, cfg = CFG } = {}) => {
  const res = await handleFans(req, { store, env, now, loadConfig: async () => cfg });
  return { status: res.status, body: await res.json(), headers: res.headers };
};

test('api: line-ups are saved, replaced, totalled, and closed at kick-off', () => withStore(async (store) => {
  const xi = SQUAD.slice(0, 11);
  let r = await call(store, post({ kind: 'lineup', match: '700090', voter: V(1), formation: '4-3-3', xi, captain: 'st' }));
  assert.equal(r.status, 200); assert.equal(r.body.saved.captain, 'st');
  r = await call(store, post({ kind: 'lineup', match: '700090', voter: V(2), formation: '4-4-2', xi }));
  assert.equal(r.status, 200);
  // voter 1 changes their mind: replaces, doesn't add
  r = await call(store, post({ kind: 'lineup', match: '700090', voter: V(1), formation: '4-4-2', xi }));
  r = await call(store, get('kind=lineup&match=700090'));
  assert.equal(r.status, 200);
  assert.equal(r.body.agg.n, 2);
  assert.equal(r.body.agg.formations['4-4-2'], 2);
  assert.equal(r.body.open, true);
  assert.match(r.headers.get('netlify-cdn-cache-control'), /s-maxage=20/);
  // saving returns the new totals at once, with the saver counted
  r = await call(store, post({ kind: 'lineup', match: '700090', voter: V(3), formation: '4-3-3', xi }));
  assert.equal(r.body.agg.n, 3);
  assert.equal(r.body.agg.formations['4-3-3'], 1);
  r = await call(store, post({ kind: 'lineup', match: '700090', voter: V(3), formation: '5-3-2', xi }));
  assert.equal(r.body.agg.n, 3, 'changing your pick replaces it in the totals');
  assert.equal(r.body.agg.formations['4-3-3'], 0);
  assert.equal(r.body.agg.formations['5-3-2'], 1);
  assert.equal((await call(store, get('kind=lineup&match=700090'))).body.agg.n, 3);
  // a pick the quick update missed (two saves at once) is picked up by the next full recount
  await store.setJSON(`votes/lineup/700090/${V(9)}`, { vote: { formation: '4-3-3', xi, captain: null } });
  assert.equal((await call(store, get('kind=lineup&match=700090'))).body.agg.n, 3, 'running totals kept for 10 minutes');
  assert.equal((await call(store, get('kind=lineup&match=700090'), { now: new Date(NOW.getTime() + 11 * 60000) })).body.agg.n, 4, 'then recounted');
  // kick-off
  r = await call(store, post({ kind: 'lineup', match: '700090', voter: V(4), formation: '4-3-3', xi }), { now: new Date('2026-10-25T14:00:00Z') });
  assert.equal(r.status, 409); assert.match(r.body.error, /closed/);
  // a match that isn't the next one
  r = await call(store, post({ kind: 'lineup', match: '999', voter: V(4), formation: '4-3-3', xi }));
  assert.equal(r.status, 409);
}));

test('api: bad input is refused politely', () => withStore(async (store) => {
  const xi = SQUAD.slice(0, 11);
  const bad = [
    [{ kind: 'lineup', match: '700090', voter: 'short', formation: '4-3-3', xi }, 400, /reload/],
    [{ kind: 'lineup', match: '700090', voter: V(1), formation: '4-3-3', xi: [...xi.slice(0, 10), 'ronaldo'] }, 400, /squad/],
    [{ kind: 'lineup', match: '700090', voter: '../../etc/passwd-aaaaaaaa', formation: '4-3-3', xi }, 400, /reload/],
    [{ kind: 'ratings', match: '700083', voter: V(1), r: {} }, 400, /at least one/],
    [{ kind: 'ratings', match: '700090', voter: V(1), r: { gk: 7 } }, 409, /isn't open/],
    [{ kind: 'nonsense' }, 400, /Unknown/],
  ];
  for (const [body, status, msg] of bad) {
    const r = await call(store, post(body));
    assert.equal(r.status, status, JSON.stringify(body));
    assert.match(r.body.error, msg);
  }
  assert.equal((await call(store, post('{not json'))).status, 400);
  assert.equal((await call(store, post('x'.repeat(9000)))).status, 413);
  assert.equal((await call(store, get('kind=lineup&match=../../x'))).status, 400);
  assert.equal((await call(store, get('kind=secret&match=1'))).status, 400);
  assert.equal((await call(store, new Request('https://koponpodcast.com/api/fans', { method: 'DELETE' }))).status, 405);
  // the fan zone not set up yet
  const r = await handleFans(get('kind=lineup&match=1'), { store, env: {}, now: NOW, loadConfig: async () => { throw new Error('404'); } });
  assert.equal(r.status, 503);
  // made-up match ids don't fill the store
  await call(store, get('kind=ratings&match=123456'));
  assert.equal((await store.list({ prefix: 'agg/' })).blobs.length, 0);
}));

test('api: one connection can only add a handful of different people a day', () => withStore(async (store) => {
  const xi = SQUAD.slice(0, 11);
  for (let i = 1; i <= 6; i++) assert.equal((await call(store, post({ kind: 'lineup', match: '700090', voter: V(i), formation: '4-3-3', xi }, '9.9.9.9'))).status, 200);
  const r = await call(store, post({ kind: 'lineup', match: '700090', voter: V(7), formation: '4-3-3', xi }, '9.9.9.9'));
  assert.equal(r.status, 429);
  assert.equal((await call(store, post({ kind: 'lineup', match: '700090', voter: V(3), formation: '4-4-2', xi }, '9.9.9.9'))).status, 200, 'someone already counted can still change their pick');
  assert.equal((await call(store, post({ kind: 'lineup', match: '700090', voter: V(7), formation: '4-3-3', xi }, '8.8.8.8'))).status, 200, 'other connections are fine');
  assert.equal((await call(store, post({ kind: 'lineup', match: '700090', voter: V(8), formation: '4-3-3', xi }, '9.9.9.9'), { now: new Date('2026-10-25T09:00:00Z') })).status, 200, 'new day');
  const keys = (await store.list({ prefix: 'ip/' })).blobs.map((b) => b.key).join(' ');
  assert.doesNotMatch(keys, /9\.9\.9\.9/, 'addresses are never stored, only scrambled');
}));

test('api: ratings and official ratings (password, throttling)', () => withStore(async (store) => {
  let r = await call(store, post({ kind: 'ratings', match: '700083', voter: V(1), r: { gk: 7, st: 9, nobody: 4 }, motm: 'st' }));
  assert.equal(r.status, 200); assert.deepEqual(r.body.saved, { r: { gk: 7, st: 9 }, motm: 'st' });
  await call(store, post({ kind: 'ratings', match: '700083', voter: V(2), r: { gk: 8 }, motm: 'gk' }));
  r = await call(store, get('kind=ratings&match=700083'));
  assert.equal(r.body.agg.n, 2);
  assert.deepEqual(r.body.agg.players.gk, { s: 15, c: 2 });
  assert.equal(r.body.official, null);
  // the manager: the password buys a 12-hour pass, which is what the page keeps
  assert.equal((await call(store, post({ kind: 'login', password: 'wrong one' }))).status, 401);
  r = await call(store, post({ kind: 'login', password: 'correct horse' }));
  assert.equal(r.status, 200);
  const token = r.body.token;
  assert.match(token, /^\d+\.[0-9a-f]{64}$/);
  assert.ok(!token.includes('horse'));
  assert.equal((await call(store, post({ kind: 'official', match: '700083', token: token.replace(/.$/, (c) => (c === '0' ? '1' : '0')), r: { gk: 6 } }))).status, 401, 'a tampered pass is refused');
  assert.equal((await call(store, post({ kind: 'official', match: '700083', token, r: { gk: 6 } }), { now: new Date(NOW.getTime() + 13 * 3600000) })).status, 401, 'passes run out after 12 hours');
  assert.equal((await call(store, post({ kind: 'official', match: '700083', token, r: { gk: 6 } }), { env: { EDITOR_PASSWORD: 'a new password' } })).status, 401, 'changing the password cancels old passes');
  r = await call(store, post({ kind: 'official', match: '700083', token, r: { gk: 6.5, st: 8.5 }, motm: 'st', note: 'Rio was superb\u0000' }));
  assert.equal(r.status, 200);
  assert.equal(r.body.official.note, 'Rio was superb');
  r = await call(store, get('kind=ratings&match=700083'));
  assert.deepEqual(r.body.official.r, { gk: 6.5, st: 8.5 });
  assert.equal(r.body.agg.n, 2, "official ratings aren't counted as a fan");
  r = await call(store, post({ kind: 'official', match: '700083', token, r: {}, motm: null }));
  assert.equal(r.body.official, null);
  assert.equal((await call(store, get('kind=ratings&match=700083'))).body.official, null, 'removed');
  // no password set up in Netlify
  assert.equal((await call(store, post({ kind: 'login', password: 'anything at all' }), { env: {} })).status, 503);
  // guessing: 12 tries an hour, then locked out, even all sent at once
  const burst = await Promise.all(Array.from({ length: 40 }, (_, i) => call(store, post({ kind: 'login', password: `guess ${i}xx` }, '6.6.6.6'))));
  assert.ok(burst.filter((x) => x.status === 401).length <= 12, `at most 12 guesses get checked (${burst.filter((x) => x.status === 401).length})`);
  r = await call(store, post({ kind: 'login', password: 'correct horse' }, '6.6.6.6'));
  assert.equal(r.status, 429, 'locked out, even with the right one');
  assert.equal((await call(store, post({ kind: 'login', password: 'correct horse' }, '6.6.6.6'), { now: new Date(NOW.getTime() + 2 * 3600000) })).status, 200, 'an hour later');
  // ratings close
  r = await call(store, post({ kind: 'ratings', match: '700083', voter: V(5), r: { gk: 7 } }), { now: new Date('2026-10-29T00:00:00Z') });
  assert.equal(r.status, 409);
}));

test('api: totals become final once voting is over', () => withStore(async (store) => {
  await call(store, post({ kind: 'ratings', match: '700083', voter: V(1), r: { gk: 7 } }));
  const after = new Date('2026-10-29T21:00:00Z');
  let r = await call(store, get('kind=ratings&match=700083'), { now: after });
  assert.equal(r.body.agg.final, true);
  assert.equal(r.body.open, false);
  // nothing new can arrive, so the final totals are simply read back from now on
  await store.setJSON('votes/ratings/700083/sneaky-extra-vote-000', { vote: { r: { gk: 1 }, motm: null } });
  r = await call(store, get('kind=ratings&match=700083'), { now: new Date('2026-11-05T21:00:00Z') });
  assert.equal(r.body.agg.n, 1);
  const t = await totals(store, 'ratings', 'nothing', { now: Date.now(), closed: true });
  assert.equal(t.n, 0);
}));

test('api: only this site can send votes; IPv6 counted per household; votes capped', () => withStore(async (store) => {
  const xi = SQUAD.slice(0, 11);
  const body = JSON.stringify({ kind: 'lineup', match: '700090', voter: V(1), formation: '4-3-3', xi });
  const req = (headers) => new Request('https://koponpodcast.com/api/fans', { method: 'POST', headers, body });
  assert.equal((await call(store, req({ 'content-type': 'text/plain', 'x-forwarded-for': '1.1.1.1' }))).status, 415, 'a plain-text post from another website is refused');
  assert.equal((await call(store, req({ 'content-type': 'application/json', origin: 'https://evil.example', 'x-forwarded-for': '1.1.1.1' }))).status, 403, 'another website is refused');
  assert.equal((await call(store, req({ 'content-type': 'application/json', origin: 'https://koponpodcast.com', 'x-forwarded-for': '1.1.1.1' }))).status, 200, 'our own pages are fine');
  assert.equal((await call(store, req({ 'content-type': 'application/json', 'content-length': '999999', 'x-forwarded-for': '1.1.1.1' }))).status, 413);
  // one household's IPv6 block is one connection, however many addresses it uses
  for (let i = 1; i <= 6; i++) assert.equal((await call(store, post({ kind: 'lineup', match: '700090', voter: V(100 + i), formation: '4-3-3', xi }, `2a00:23c4:abcd:1200::${i.toString(16)}`))).status, 200);
  assert.equal((await call(store, post({ kind: 'lineup', match: '700090', voter: V(200), formation: '4-3-3', xi }, '2a00:23c4:abcd:1200:ffff:1:2:3'))).status, 429);
  assert.equal((await call(store, post({ kind: 'lineup', match: '700090', voter: V(201), formation: '4-3-3', xi }, '2a00:23c4:abcd:1201::1'))).status, 200, 'the next household along is separate');
  // a ceiling per match
  const agg = await store.get('agg/lineup/700090', { type: 'json' });
  await store.setJSON('agg/lineup/700090', { ...agg, n: 25000 });
  assert.equal((await call(store, post({ kind: 'lineup', match: '700090', voter: V(300), formation: '4-3-3', xi }, '5.5.5.5'))).status, 429);
  assert.equal((await call(store, post({ kind: 'lineup', match: '700090', voter: V(1), formation: '4-4-2', xi }, '1.1.1.1'))).status, 200, 'people already counted can still change their pick');
  // stored connections are scrambled with a secret, never the address itself
  const keys = (await store.list({ prefix: 'ip/' })).blobs.map((b) => b.key).join(' ');
  assert.doesNotMatch(keys, /2a00|1\.1\.1\.1/);
  assert.ok((await store.get('meta/salt', { type: 'json' })).salt.length >= 32);
}));

test('api: postponed matches reopen; unknown matches cost nothing', () => withStore(async (store) => {
  await call(store, post({ kind: 'ratings', match: '700083', voter: V(1), r: { gk: 7 } }));
  // looked at long after voting closed: final
  assert.equal((await call(store, get('kind=ratings&match=700083'), { now: new Date('2026-10-30T00:00:00Z') })).body.agg.final, true);
  // ...then the match is moved and voting opens again
  const cfg = { ...CFG, rate: [{ ...CFG.rate[0], closes: '2026-11-10T19:00:00Z' }] };
  const later = new Date('2026-11-02T12:00:00Z');
  let r = await call(store, post({ kind: 'ratings', match: '700083', voter: V(2), r: { gk: 9 } }), { now: later, cfg });
  assert.equal(r.status, 200);
  assert.equal(r.body.agg.n, 2, 'counted again');
  r = await call(store, get('kind=ratings&match=700083'), { now: later, cfg });
  assert.equal(r.body.agg.final, false);
  assert.equal(r.body.agg.n, 2);
  // the line-up picks for a match that's since been played (shown on its ratings page)
  await store.setJSON(`votes/lineup/700083/${V(5)}`, { vote: { formation: '4-3-3', xi: SQUAD.slice(0, 11), captain: null } });
  r = await call(store, get('kind=lineup&match=700083'), { now: later, cfg });
  assert.equal(r.body.agg.n, 1);
  assert.equal(r.body.agg.final, true, "kick-off was ages ago: final");
  // made-up ids: no listing, nothing stored
  let listed = 0;
  const spy = { ...store, list: async (o) => { listed++; return store.list(o); }, get: store.get.bind(store), setJSON: store.setJSON.bind(store) };
  await call(spy, get('kind=ratings&match=1234567'));
  assert.equal(listed, 0);
}));

test('formations: unusual ESPN shapes map onto ours by position', async () => {
  const { remapXI, nearestFormation } = await import('../src/assets/fans-core.js');
  assert.equal(nearestFormation('3-4-1-2'), '3-5-2');
  assert.equal(nearestFormation('4-3-1-2'), '4-4-2');
  assert.equal(nearestFormation('4-1-2-1-2'), '4-4-2');
  assert.equal(nearestFormation('4-2-3-1'), '4-2-3-1');
  assert.equal(nearestFormation('nonsense'), '4-3-3');
  const xi = ['gk', 'rcb', 'cb', 'lcb', 'rm', 'rcm', 'lcm', 'lm', 'am', 'rs', 'ls'];
  const out = remapXI(xi, '3-4-1-2', '3-5-2');
  assert.deepEqual(out.slice(0, 4), ['gk', 'rcb', 'cb', 'lcb'], 'defenders stay defenders');
  assert.deepEqual(out.slice(9), ['rs', 'ls'], 'strikers stay strikers');
  assert.deepEqual(new Set(out), new Set(xi), 'nobody lost');
  const toBack4 = remapXI(xi, '3-4-1-2', '4-3-3');
  assert.equal(toBack4[0], 'gk');
  assert.ok(!toBack4.slice(1, 5).includes('rm') || toBack4.slice(1, 5).filter((x) => ['rcb', 'cb', 'lcb'].includes(x)).length === 3, 'a midfielder only fills in at the back when there are spare places');
  assert.equal(new Set(toBack4.filter(Boolean)).size, 11);
});

test('names: different players who share a surname are kept apart', async () => {
  const { sameName } = await import('../lib/stats/espn.mjs');
  assert.equal(sameName('Rhys Williams', 'Rio Williams'), false);
  assert.equal(sameName('Jack Smith', 'James Smith'), false);
  assert.equal(sameName('D. Szoboszlai', 'Dominik Szoboszlai'), true);
  assert.equal(sameName('Salah', 'Mohamed Salah'), true);
  assert.equal(sameName('Ibrahima Konaté', 'Ibrahima Konate'), true);
});

test('photos: Wikipedia must be the same person; youth and women\'s sides are different clubs', async () => {
  const { lookupFace } = await import('../lib/fans/faces.mjs');
  const wiki = (title) => async (url) => {
    if (url.includes('wikipedia.org')) return new Response(JSON.stringify({ query: { pages: { 1: { index: 1, title, thumbnail: { source: 'https://upload.wikimedia.org/x.jpg' }, terms: { description: ['Scottish footballer'] } } } } }));
    if (url.includes('fotmob.com/api')) return new Response(JSON.stringify([{ suggestions: [{ type: 'player', id: '5', name: 'Jon Gomez', teamName: 'Liverpool U21' }] }]));
    if (url.includes('images.fotmob')) return new Response(new Uint8Array(5000), { headers: { 'content-type': 'image/png' } });
    return new Response('{}', { status: 404 });
  };
  assert.equal(await lookupFace(wiki('Ben Doak'), 'Kieran Doak', 'Liverpool'), null);
  assert.equal(await lookupFace(wiki('Morgan Gibbs-White'), 'Calum White', 'Liverpool'), null);
  assert.equal((await lookupFace(wiki('Kieran Doak (footballer)'), 'Kieran Doak', 'Liverpool')).src, 'wiki');
  assert.equal(await lookupFace(wiki('Nobody'), 'Joe Gomez', 'Liverpool'), null, "not the U21 namesake's face");
  assert.equal(clubScore('Liverpool', 'Liverpool U21'), 0);
  assert.equal(clubScore('Liverpool', 'Liverpool Women'), 0);
});

test('a kick-off time that is not fixed yet: picks close at 11:30 UK time on matchday', async () => {
  const { matchdayMorning } = await import('../lib/fans/build.mjs');
  assert.equal(matchdayMorning('2026-11-08T00:00Z'), '2026-11-08T11:30:00.000Z', 'winter: GMT');
  assert.equal(matchdayMorning('2026-10-03T23:00Z'), '2026-10-04T10:30:00.000Z', 'summer time, date in UK time');
});
