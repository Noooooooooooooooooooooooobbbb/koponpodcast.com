// A pretend 2026/27 season served in the same shapes as ESPN, football-data.org
// and API-Football, for testing the Stats pages offline. Not real results.
const NOW = Date.parse('2026-10-23T12:00:00Z');
let seed = 20262027;
const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

// [espnId, displayName, short, abbr, fdId, fdShort]
const PL = [
  ['364', 'Liverpool', 'Liverpool', 'LIV', 64, 'Liverpool'], ['359', 'Arsenal', 'Arsenal', 'ARS', 57, 'Arsenal'], ['382', 'Manchester City', 'Man City', 'MNC', 65, 'Man City'],
  ['363', 'Chelsea', 'Chelsea', 'CHE', 61, 'Chelsea'], ['331', 'Brighton & Hove Albion', 'Brighton', 'BHA', 397, 'Brighton Hove'], ['362', 'Aston Villa', 'Aston Villa', 'AVL', 58, 'Aston Villa'],
  ['361', 'Newcastle United', 'Newcastle', 'NEW', 67, 'Newcastle'], ['367', 'Tottenham Hotspur', 'Tottenham', 'TOT', 73, 'Tottenham'], ['360', 'Manchester United', 'Man United', 'MAN', 66, 'Man United'],
  ['371', 'West Ham United', 'West Ham', 'WHU', 563, 'West Ham'], ['337', 'Brentford', 'Brentford', 'BRE', 402, 'Brentford'], ['370', 'Fulham', 'Fulham', 'FUL', 63, 'Fulham'],
  ['384', 'Crystal Palace', 'Crystal Palace', 'CRY', 354, 'Crystal Palace'], ['368', 'Everton', 'Everton', 'EVE', 62, 'Everton'], ['393', 'Nottingham Forest', "Nott'm Forest", 'NFO', 351, 'Nottingham'],
  ['349', 'AFC Bournemouth', 'Bournemouth', 'BOU', 1044, 'Bournemouth'], ['380', 'Wolverhampton Wanderers', 'Wolves', 'WOL', 76, 'Wolverhampton'], ['357', 'Leeds United', 'Leeds', 'LEE', 341, 'Leeds United'],
  ['379', 'Burnley', 'Burnley', 'BUR', 328, 'Burnley'], ['366', 'Sunderland', 'Sunderland', 'SUN', 71, 'Sunderland'],
];
const OTHER = { 86: ['86', 'Real Madrid', 'Real Madrid', 'RMA'], 110: ['110', 'Internazionale', 'Inter', 'INT'], 2672: ['2672', 'Villarreal', 'Villarreal', 'VIL'], 3449: ['3449', 'LASK', 'LASK', 'LASK'] };
const team = (id) => { const t = PL.find((x) => x[0] === String(id)) || OTHER[id]; return { id: t[0], displayName: t[1], shortDisplayName: t[2], abbreviation: t[3], name: t[2], location: t[2], logos: [{ href: `https://a.espncdn.com/i/teamlogos/soccer/500/${t[0]}.png` }] }; };
const LEAGUES = { 'eng.1': 'English Premier League', 'uefa.champions': 'UEFA Champions League', 'eng.league_cup': 'English Carabao Cup', 'esp.1': 'Spanish LALIGA' };

// ---- the Premier League season so far (9 matchdays) ---------------------------------
const LIV_PL = [['361', false, 2, 2], ['393', true, 3, 1], ['379', true, 2, 0], ['349', false, 1, 0], ['368', true, 2, 1], ['363', false, 1, 1], ['382', true, 1, 2], ['357', false, 3, 0], ['370', true, 2, 1]];
const matchdays = ['2026-08-23', '2026-08-30', '2026-09-13', '2026-09-20', '2026-09-27', '2026-10-04', '2026-10-11', '2026-10-18', '2026-10-21'];
const events = [];
let nid = 700000;
const ev = (slug, date, h, a, hs, as, done) => ({
  id: String(++nid), uid: `s:600~e:${nid}`, date, name: `${team(a).displayName} at ${team(h).displayName}`, league: { name: LEAGUES[slug], slug },
  competitions: [{ venue: { fullName: `${team(h).shortDisplayName} Stadium` }, status: { type: { completed: done, state: done ? 'post' : 'pre', shortDetail: done ? 'FT' : '' } },
    competitors: [{ homeAway: 'home', id: String(h), team: team(h), score: done ? { value: hs, displayValue: String(hs) } : undefined }, { homeAway: 'away', id: String(a), team: team(a), score: done ? { value: as, displayValue: String(as) } : undefined }] }],
  _slug: slug, _h: String(h), _a: String(a), _hs: hs, _as: as, _done: done,
});
matchdays.forEach((d, i) => {
  if (i === 8) return; // the 21st is a midweek European night for us
  const [opp, home, gf, ga] = LIV_PL[i];
  const rest = PL.map((t) => t[0]).filter((id) => id !== '364' && id !== opp);
  for (let k = rest.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [rest[k], rest[j]] = [rest[j], rest[k]]; }
  events.push(home ? ev('eng.1', `${d}T14:00Z`, '364', opp, gf, ga, true) : ev('eng.1', `${d}T14:00Z`, opp, '364', ga, gf, true));
  for (let k = 0; k < rest.length; k += 2) events.push(ev('eng.1', `${d}T14:00Z`, rest[k], rest[k + 1], Math.floor(rnd() * 4), Math.floor(rnd() * 3), true));
});
// Europe and cups
events.push(ev('uefa.champions', '2026-09-30T19:00Z', '364', '110', 2, 0, true));
events.push(ev('uefa.champions', '2026-10-14T19:00Z', '3449', '364', 1, 4, true));
events.push(ev('uefa.champions', '2026-10-21T19:00Z', '364', '2672', 4, 3, true));
for (let i = 0; i < 6; i++) events.push(ev('esp.1', `2026-0${8 + Math.floor(i / 3)}-${String(10 + i * 3).padStart(2, '0')}T19:00Z`, '86', pick(['2672', '86']) === '86' ? '2672' : '2672', 2, i % 3, true));
// coming up
const UP = [
  ev('eng.1', '2026-10-25T14:00Z', '364', '331', null, null, false),
  ev('uefa.champions', '2026-10-28T20:00Z', '86', '364', null, null, false),
  ev('eng.1', '2026-11-01T15:00Z', '362', '364', null, null, false),
  ev('eng.league_cup', '2026-11-04T19:45Z', '364', '384', null, null, false),
  ev('eng.1', '2026-11-08T17:30Z', '364', '359', null, null, false),
  ev('eng.1', '2026-11-22T15:00Z', '370', '364', null, null, false), // a sixth, to check only five are shown
];
events.push(...UP);
const strip = (e) => { const { _slug, _h, _a, _hs, _as, _done, ...rest } = e; return rest; };

// ---- match details -------------------------------------------------------------
const PLAYERS = { 364: ['Mohamed Salah', 'Hugo Ekitike', 'Bradley Barcola', 'Florian Wirtz', 'Virgil van Dijk', 'Rio Ngumoha'], default: ['Player One', 'Player Two', 'Player Three', 'Player Four'] };
const LIV_SQUAD = [['Alisson Becker', 'G', 1], ['Jeremie Frimpong', 'RB', 30], ['Ibrahima Konate', 'CD-R', 5], ['Virgil van Dijk', 'CD-L', 4], ['Milos Kerkez', 'LB', 6], ['Ryan Gravenberch', 'DM', 38], ['Florian Wirtz', 'AM', 7], ['Alexis Mac Allister', 'CM-L', 10], ['Mohamed Salah', 'RW', 11], ['Hugo Ekitike', 'CF', 22], ['Bradley Barcola', 'LW', 29], ['Rio Ngumoha', 'LW', 73], ['Curtis Jones', 'CM', 17], ['Giorgi Mamardashvili', 'G', 25]];
// Brighton: Solly March started last time but is injured now, so the predicted XI swaps him
const BHA_SQUAD = [['Bart Verbruggen', 'G', 1], ['Joel Veltman', 'RB', 34], ['Jan Paul van Hecke', 'CD-R', 6], ['Lewis Dunk', 'CD-L', 5], ['Pervis Estupinan', 'LB', 30], ['Carlos Baleba', 'DM-R', 20], ['Yasin Ayari', 'DM-L', 26], ['Solly March', 'RM', 7], ['Georginio Rutter', 'AM', 14], ['Kaoru Mitoma', 'LM', 22], ['Danny Welbeck', 'CF', 18], ['Yankuba Minteh', 'RM', 11], ['Jack Hinshelwood', 'CM', 13], ['Jason Steele', 'G', 23]];
const SPOTS = ['from the centre of the box', 'from outside the box', 'from the left side of the box', 'from very close range', 'from the right side of the six yard box', 'from a difficult angle on the right'];
function boxscore(e) {
  const mk = (id, goals, opp) => {
    const shots = 8 + Math.floor(rnd() * 10) + goals * 2, on = Math.min(shots, goals + 2 + Math.floor(rnd() * 4));
    const passes = 350 + Math.floor(rnd() * 300), acc = Math.floor(passes * (0.75 + rnd() * 0.15));
    return { team: team(id), statistics: [
      ['possessionPct', (40 + rnd() * 20).toFixed(1)], ['totalShots', shots], ['shotsOnTarget', on], ['blockedShots', Math.floor(rnd() * 5)], ['wonCorners', Math.floor(rnd() * 10)],
      ['totalPasses', passes], ['accuratePasses', acc], ['passPct', (acc / passes).toFixed(3)], ['totalCrosses', 10 + Math.floor(rnd() * 15)], ['totalLongBalls', 30 + Math.floor(rnd() * 30)],
      ['totalTackles', 12 + Math.floor(rnd() * 12)], ['effectiveTackles', 8 + Math.floor(rnd() * 8)], ['interceptions', 5 + Math.floor(rnd() * 8)], ['totalClearance', 10 + Math.floor(rnd() * 20)],
      ['saves', Math.floor(rnd() * 5)], ['foulsCommitted', 6 + Math.floor(rnd() * 8)], ['yellowCards', Math.floor(rnd() * 4)], ['redCards', 0], ['offsides', Math.floor(rnd() * 4)],
    ].map(([name, v]) => ({ name, displayValue: String(v), label: name })) , _shots: shots, _goals: goals };
  };
  const H = mk(e._h, e._hs), A = mk(e._a, e._as);
  const commentary = [], rosters = [];
  for (const [side, opp] of [[H, A], [A, H]]) {
    const nm = side.team.displayName, who = PLAYERS[side.team.id] || PLAYERS.default;
    const scorers = Array.from({ length: side._goals }, () => pick(who));
    const squad = side.team.id === '364' ? LIV_SQUAD : side.team.id === '331' ? BHA_SQUAD : [];
    rosters.push({ team: { id: side.team.id }, formation: side.team.id === '331' ? '4-2-3-1' : '4-3-3', roster: squad.map(([name, pos, jersey], i) => {
      const g = scorers.filter((x) => x === name).length;
      const stats = [['totalGoals', g], ['totalShots', g + (i % 3)], ['shotsOnTarget', g + (i % 2)], ['goalAssists', i === 3 && side._goals > 1 ? 1 : 0], ['saves', pos === 'G' ? 3 : 0], ['yellowCards', i === 6 && side._goals === 0 ? 1 : 0], ['foulsCommitted', i % 2], ['foulsSuffered', 1]].map(([name, value]) => ({ name, value }));
      const starter = i < 11;
      return { athlete: { id: String(side.team.id === '364' ? jersey * 7 : 9000 + i), displayName: name }, jersey: String(jersey), formationPlace: starter ? String(i + 1) : '0', position: { abbreviation: pos }, starter, subbedIn: !starter && i < 13, subbedOut: starter && i === 10, plays: i === 10 || i === 11 ? [{ substitution: true, clock: { displayValue: "65'" } }] : [], stats };
    }) });
    for (const s of scorers) commentary.push({ text: `Goal! ${H.team.displayName} 1, ${A.team.displayName} 0. ${s} (${nm}) right footed shot ${pick(SPOTS)} to the bottom left corner.` });
    for (let s = side._goals; s < side._shots; s++) commentary.push({ text: `Attempt ${pick(['missed', 'saved', 'blocked'])}. ${pick(who)} (${nm}) ${rnd() < 0.2 ? 'header' : 'left footed shot'} ${pick(SPOTS)}${rnd() < 0.2 ? ' following a corner' : ''} misses to the left.` });
  }
  return { rosters, boxscore: { teams: [H, A].map(({ _shots, _goals, ...t }) => t) }, header: { competitions: [{ competitors: [{ id: e._h, score: String(e._hs) }, { id: e._a, score: String(e._as) }] }] }, commentary };
}
function previewSummary(e) {
  const h2h = [{ gameDate: '2026-03-01T15:00Z', homeTeamId: e._h, awayTeamId: e._a, homeTeamScore: '2', awayTeamScore: '1', leagueName: LEAGUES[e._slug] }, { gameDate: '2025-10-05T15:00Z', homeTeamId: e._a, awayTeamId: e._h, homeTeamScore: '1', awayTeamScore: '1', leagueName: LEAGUES[e._slug] }];
  const inj = e._a === '331' ? [{ team: { id: '331' }, injuries: [{ athlete: { displayName: 'Solly March' }, status: 'Out', details: { type: 'Knee' } }, { athlete: { displayName: 'Danny Welbeck' }, status: 'Questionable', details: { type: 'Hamstring' } }] }] : [];
  return { gameInfo: { venue: { fullName: e._h === '364' ? 'Anfield' : `${team(e._h).shortDisplayName} Stadium` } }, headToHeadGames: [{ team: { id: e._h }, events: h2h }], injuries: inj };
}
const FLAG = (c) => `https://a.espncdn.com/i/teamlogos/countries/500/${c}.png`;
const A = (displayName, jersey, pos, nat, injuries = []) => ({ id: String(jersey * 7), displayName, jersey: String(jersey), position: { abbreviation: pos, name: { G: 'Goalkeeper', D: 'Defender', M: 'Midfielder', F: 'Forward' }[pos] }, citizenship: nat, flag: { href: FLAG(nat.slice(0, 3).toLowerCase()), alt: nat }, injuries });
const ROSTERS = {
  364: { athletes: [
    A('Alisson Becker', 1, 'G', 'Brazil'), A('Giorgi Mamardashvili', 25, 'G', 'Georgia'), A('Freddie Woodman', 28, 'G', 'England'),
    A('Jeremie Frimpong', 30, 'D', 'Netherlands'), A('Ibrahima Konate', 5, 'D', 'France'), A('Virgil van Dijk', 4, 'D', 'Netherlands'), A('Milos Kerkez', 6, 'D', 'Hungary'), A('Joe Gomez', 2, 'D', 'England'), A('Andrew Robertson', 26, 'D', 'Scotland'), A('Conor Bradley', 12, 'D', 'Northern Ireland'),
    A('Ryan Gravenberch', 38, 'M', 'Netherlands'), A('Alexis Mac Allister', 10, 'M', 'Argentina'), A('Florian Wirtz', 7, 'M', 'Germany'), A('Dominik Szoboszlai', 8, 'M', 'Hungary', [{ status: 'Out', details: { type: 'Hamstring' } }]), A('Curtis Jones', 17, 'M', 'England'), A('Wataru Endo', 3, 'M', 'Japan'),
    A('Mohamed Salah', 11, 'F', 'Egypt'), A('Hugo Ekitike', 22, 'F', 'France'), A('Bradley Barcola', 29, 'F', 'France'), A('Rio Ngumoha', 73, 'F', 'England'), A('Federico Chiesa', 14, 'F', 'Italy'), A('Victor Munoz', 19, 'F', 'Spain', [{ status: 'Day-To-Day' }]),
  ] },
  331: { athletes: [{ displayName: 'Solly March', injuries: [{ status: 'Out' }] }] },
};

// ---- player photos (FotMob search + images, Wikipedia as the fallback) ----------------------
export const FOTMOB = { 'Alisson Becker': 33001, 'Virgil van Dijk': 33004, 'Mohamed Salah': 33011, 'Hugo Ekitike': 33022, 'Florian Wirtz': 33007, 'Ryan Gravenberch': 33038, 'Bradley Barcola': 33029, 'Jeremie Frimpong': 33030, 'Curtis Jones': 33017, 'Kaoru Mitoma': 44022, 'Lewis Dunk': 44005 };
const BLANK_FOTMOB = new Set([33017]); // FotMob's empty silhouette for him: Wikipedia is used instead
const fotmobTeam = (n) => (['Kaoru Mitoma', 'Lewis Dunk'].includes(n) ? 'Brighton & Hove Albion' : 'Liverpool');

// ---- football-data.org -----------------------------------------------------------------
function plTable() {
  const T = new Map(PL.map((t) => [t[0], { t, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, form: [] }]));
  for (const e of events.filter((x) => x._slug === 'eng.1' && x._done)) {
    for (const [me, gf, ga] of [[e._h, e._hs, e._as], [e._a, e._as, e._hs]]) {
      const o = T.get(me); o.P++; o.GF += gf; o.GA += ga; const r = gf > ga ? 'W' : gf < ga ? 'L' : 'D'; o[r]++; o.form.unshift(r);
    }
  }
  const rows = [...T.values()].map((o) => ({ ...o, Pts: o.W * 3 + o.D, GD: o.GF - o.GA })).sort((a, b) => b.Pts - a.Pts || b.GD - a.GD || b.GF - a.GF);
  return { competition: { name: 'Premier League', code: 'PL' }, season: { currentMatchday: 8 }, standings: [{ stage: 'REGULAR_SEASON', type: 'TOTAL', table: rows.map((o, i) => ({ position: i + 1, team: { id: o.t[4], name: `${o.t[1]} FC`, shortName: o.t[5], tla: o.t[3], crest: `https://crests.football-data.org/${o.t[4]}.png` }, playedGames: o.P, form: o.form.slice(0, 5).join(','), won: o.W, draw: o.D, lost: o.L, points: o.Pts, goalsFor: o.GF, goalsAgainst: o.GA, goalDifference: o.GD })) }, { type: 'HOME', table: [] }] };
}
function clTable() {
  const names = ['Liverpool FC|Liverpool|LIV|64', 'Real Madrid CF|Real Madrid|RMA|86', 'FC Internazionale Milano|Inter|INT|108', 'Villarreal CF|Villarreal|VIL|94', 'LASK|LASK|LAS|1877'];
  for (let i = names.length; i < 36; i++) names.push(`Club ${i}|Club ${i}|C${i}|${9000 + i}`);
  return { competition: { name: 'UEFA Champions League', code: 'CL' }, season: { currentMatchday: 3 }, standings: [{ stage: 'LEAGUE_STAGE', type: 'TOTAL', table: names.map((n, i) => { const [name, shortName, tla, id] = n.split('|'); const pts = Math.max(0, 9 - Math.floor(i / 4)); return { position: i + 1, team: { id: +id, name, shortName, tla, crest: `https://crests.football-data.org/${id}.png` }, playedGames: 3, form: null, won: Math.floor(pts / 3), draw: pts % 3, lost: 3 - Math.floor(pts / 3) - (pts % 3), points: pts, goalsFor: 10 - Math.floor(i / 4), goalsAgainst: 2 + Math.floor(i / 6), goalDifference: 8 - Math.floor(i / 4) - Math.floor(i / 6) }; }) }] };
}
const scorers = { scorers: [
  { player: { name: 'Erling Haaland' }, team: { id: 65, name: 'Manchester City FC', shortName: 'Man City', crest: '' }, playedMatches: 8, goals: 11, assists: 1, penalties: 2 },
  { player: { name: 'Hugo Ekitike' }, team: { id: 64, name: 'Liverpool FC', shortName: 'Liverpool', crest: '' }, playedMatches: 8, goals: 7, assists: 3, penalties: 0 },
  { player: { name: 'Mohamed Salah' }, team: { id: 64, name: 'Liverpool FC', shortName: 'Liverpool', crest: '' }, playedMatches: 8, goals: 5, assists: 6, penalties: 1 },
] };

// ---- API-Football ----------------------------------------------------------------------
const AF_PLAYERS = [
  ['Mohamed Salah', 'Attacker', 11, 10, 905, 6, 7, 31, 15, 22, 380, 84, 14, 25, 4, 2, '7.61', 6, 1],
  ['Hugo Ekitike', 'Attacker', 11, 9, 812, 8, 3, 28, 14, 12, 210, 76, 9, 18, 3, 4, '7.38', 3, 0],
  ['Florian Wirtz', 'Midfielder', 10, 8, 701, 3, 5, 18, 7, 29, 455, 88, 21, 30, 8, 9, '7.42', 1, 0],
  ['Virgil van Dijk', 'Defender', 11, 11, 990, 1, 0, 6, 3, 4, 790, 91, 0, 1, 14, 22, '7.10', 2, 0],
  ['Alisson Becker', 'Goalkeeper', 9, 9, 810, 0, 0, 0, 0, 0, 280, 82, 0, 0, 0, 0, '6.95', 0, 0],
  ['Rio Ngumoha', 'Attacker', 7, 2, 290, 2, 2, 9, 5, 6, 90, 79, 11, 16, 2, 1, '7.20', 0, 0],
  ['Bradley Barcola', 'Attacker', 6, 4, 360, 3, 1, 12, 6, 5, 110, 80, 7, 13, 2, 1, '7.05', 1, 0],
];
function afPlayers(page) {
  const list = page === 1 ? AF_PLAYERS.slice(0, 5) : AF_PLAYERS.slice(5);
  return { get: 'players', errors: [], paging: { current: page, total: 2 }, response: list.map(([name, pos, apps, starts, mins, g, a, sh, on, kp, passes, acc, drib, dribT, tk, ints, rating, yc, rc], i) => {
    // split each player's season over two competitions, as the real API does
    const half = (x) => Math.round(x * 0.7), rest = (x) => x - Math.round(x * 0.7);
    const comp = (f, league) => ({ team: { id: 40, name: 'Liverpool' }, league: { id: league, name: league === 39 ? 'Premier League' : 'UEFA Champions League' }, games: { appearences: f(apps), lineups: f(starts), minutes: f(mins), position: pos, rating: rating, captain: false }, shots: { total: f(sh), on: f(on) }, goals: { total: f(g), conceded: pos === 'Goalkeeper' ? f(8) : 0, assists: f(a), saves: pos === 'Goalkeeper' ? f(25) : null }, passes: { total: f(passes), key: f(kp), accuracy: acc }, tackles: { total: f(tk), blocks: 1, interceptions: f(ints) }, duels: { total: f(60), won: f(33) }, dribbles: { attempts: f(dribT), success: f(drib), past: null }, fouls: { drawn: f(12), committed: f(8) }, cards: { yellow: f(yc), yellowred: 0, red: f(rc) } });
    return { player: { id: 1000 + i + page * 100, name, firstname: name.split(' ')[0], lastname: name.split(' ').slice(1).join(' '), age: 25, photo: '' }, statistics: [comp(half, 39), comp(rest, 2)] };
  }) };
}
const afFixtures = { errors: [], response: [
  { fixture: { id: 5551, date: '2026-10-25T14:00:00+00:00' }, league: { id: 39, name: 'Premier League' }, teams: { home: { id: 40, name: 'Liverpool' }, away: { id: 51, name: 'Brighton' } } },
  { fixture: { id: 5552, date: '2026-10-28T20:00:00+00:00' }, league: { id: 2, name: 'UEFA Champions League' }, teams: { home: { id: 541, name: 'Real Madrid' }, away: { id: 40, name: 'Liverpool' } } },
] };
const afInjury = { 5551: { errors: [], response: [{ player: { name: 'D. Szoboszlai', type: 'Missing Fixture', reason: 'Hamstring Injury' }, team: { id: 40, name: 'Liverpool' } }, { player: { name: 'Kaoru Mitoma', type: 'Questionable', reason: 'Ankle Injury' }, team: { id: 51, name: 'Brighton' } }] },
  5552: { errors: [], response: [{ player: { name: 'Kylian Mbappe', type: 'Missing Fixture', reason: 'Suspended' }, team: { id: 541, name: 'Real Madrid' } }] } };

// ---- the pretend internet --------------------------------------------------------------------
export const calls = [];
export function statsFetch({ failFd = false, failAf = false, afRemaining = 90 } = {}) {
  return async (url, init = {}) => {
    calls.push(String(url));
    const u = new URL(url);
    const J = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
    if (u.host === 'site.api.espn.com' && u.pathname.startsWith('/apis/v2/')) {
      const m = u.pathname.match(/\/soccer\/([\w.]+)\/standings$/);
      if (!m || m[1] !== 'eng.1') return J({}, 404);
      const espnOf = (fdId) => PL.find((t) => t[4] === fdId);
      return J({ children: [{ name: '2026-27 English Premier League', standings: { entries: plTable().standings[0].table.map((r) => ({ team: team(espnOf(r.team.id)[0]), stats: [['rank', r.position], ['gamesPlayed', r.playedGames], ['wins', r.won], ['ties', r.draw], ['losses', r.lost], ['pointsFor', r.goalsFor], ['pointsAgainst', r.goalsAgainst], ['pointDifferential', r.goalDifference], ['points', r.points]].map(([name, value]) => ({ name, value, displayValue: String(value) })) })) } }] });
    }
    if (u.host === 'site.api.espn.com') {
      let m = u.pathname.match(/\/soccer\/all\/teams\/(\w+)\/schedule$/);
      if (m) {
        const id = m[1], fixture = u.searchParams.get('fixture') === 'true', season = u.searchParams.get('season');
        const mine = events.filter((e) => e._h === id || e._a === id);
        const list = fixture ? mine.filter((e) => !e._done) : season === '2026' ? mine : [];
        return J({ team: team(id), events: list.map(strip) });
      }
      m = u.pathname.match(/\/soccer\/([\w.]+)\/summary$/);
      if (m) {
        const e = events.find((x) => x.id === u.searchParams.get('event'));
        if (!e) return J({}, 404);
        return J(e._done ? boxscore(e) : previewSummary(e));
      }
      m = u.pathname.match(/\/soccer\/([\w.]+)\/teams\/(\w+)\/roster$/);
      if (m) return J(ROSTERS[m[2]] || { athletes: [] });
      m = u.pathname.match(/\/soccer\/([\w.]+)\/scoreboard$/);
      if (m) {
        const slug = m[1], d = u.searchParams.get('dates');
        const cal = [...new Set(events.filter((e) => e._slug === slug).map((e) => e.date.slice(0, 10)))].map((x) => `${x}T07:00Z`);
        const day = events.filter((e) => e._slug === slug && e.date.slice(0, 10).replace(/-/g, '') === d);
        return J({ leagues: [{ name: LEAGUES[slug], slug, calendar: cal }], events: day.map(strip) });
      }
      return J({}, 404);
    }
    if (u.host === 'api.football-data.org') {
      if (failFd) return J({ message: 'The resource you are looking for is restricted.' }, 403);
      if (init.headers?.['X-Auth-Token'] !== 'fd-test-key') return J({ message: 'bad key' }, 400);
      if (u.pathname === '/v4/competitions/PL/standings') return J(plTable());
      if (u.pathname === '/v4/competitions/CL/standings') return J(clTable());
      if (u.pathname === '/v4/competitions/PL/scorers') return J(scorers);
      return J({}, 404);
    }
    if (u.host === 'v3.football.api-sports.io') {
      const h = { 'x-ratelimit-requests-remaining': String(afRemaining) };
      if (failAf) return J({ errors: { plan: 'Free plans do not have access to this season, try from 2021 to 2023.' }, response: [] }, 200, h);
      if (init.headers?.['x-apisports-key'] !== 'af-test-key') return J({ errors: { token: 'Error/Missing application key.' }, response: [] }, 200, h);
      if (u.pathname === '/players') return J(afPlayers(+u.searchParams.get('page')), 200, h);
      if (u.pathname === '/fixtures') return J(afFixtures, 200, h);
      if (u.pathname === '/injuries') return J(afInjury[u.searchParams.get('fixture')] || { errors: [], response: [] }, 200, h);
      return J({ errors: [], response: [] }, 200, h);
    }
    if (u.host === 'www.fotmob.com' && u.pathname === '/api/search/suggest') {
      const term = (u.searchParams.get('term') || '').toLowerCase();
      const hits = Object.entries(FOTMOB).filter(([n]) => n.toLowerCase().includes(term) || term.includes(n.toLowerCase().split(' ').pop()));
      return J([{ title: { key: 'players' }, suggestions: hits.map(([name, id]) => ({ type: 'player', id: String(id), name, teamName: fotmobTeam(name) })) }]);
    }
    if (u.host === 'images.fotmob.com') {
      const id = +(u.pathname.match(/(\d+)\.png$/) || [])[1];
      if (!Object.values(FOTMOB).includes(id)) return new Response('no', { status: 404 });
      return new Response(new Uint8Array(BLANK_FOTMOB.has(id) ? 900 : 4000), { headers: { 'content-type': 'image/png' } });
    }
    if (u.host === 'www.thesportsdb.com') return J({ player: null });
    if (u.host === 'en.wikipedia.org') {
      const q = u.searchParams.get('gsrsearch') || '';
      if (/curtis jones/i.test(q)) return J({ query: { pages: { 1: { index: 1, title: 'Curtis Jones (footballer)', thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Curtis_Jones.jpg/320px-Curtis_Jones.jpg' }, terms: { description: ['English footballer'] } } } } });
      return J({ batchcomplete: '' });
    }
    return new Response('not found', { status: 404 });
  };
}
export const TEST_NOW = new Date(NOW);
