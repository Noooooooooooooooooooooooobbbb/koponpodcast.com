// The fan zone's rules, shared by the browser and the /api/fans function, so
// what a visitor sees and what the server accepts can never disagree.
// Formations and the ratings colours come from Flappy Jim.

// Lines from the back: [how far down the pitch picture (0 = top, where we attack;
// 1 = our own goal line), [positions across, 0 = left … 1 = right, team's right first]]
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

export const FORMATIONS = {
  '4-3-3': [[0.74, [0.85, 0.62, 0.38, 0.15]], [0.5, [0.75, 0.5, 0.25]], [0.25, [0.8, 0.5, 0.2]]],
  '4-2-3-1': [[0.74, [0.85, 0.62, 0.38, 0.15]], [0.59, [0.65, 0.35]], [0.41, [0.8, 0.5, 0.2]], [0.22, [0.5]]],
  '4-4-2': [[0.74, [0.85, 0.62, 0.38, 0.15]], [0.5, [0.85, 0.62, 0.38, 0.15]], [0.26, [0.65, 0.35]]],
  '4-1-4-1': [[0.74, [0.85, 0.62, 0.38, 0.15]], [0.61, [0.5]], [0.44, [0.85, 0.62, 0.38, 0.15]], [0.22, [0.5]]],
  '4-4-1-1': [[0.74, [0.85, 0.62, 0.38, 0.15]], [0.52, [0.85, 0.62, 0.38, 0.15]], [0.35, [0.5]], [0.2, [0.5]]],
  '3-4-3': [[0.74, [0.75, 0.5, 0.25]], [0.5, [0.85, 0.62, 0.38, 0.15]], [0.25, [0.8, 0.5, 0.2]]],
  '3-5-2': [[0.74, [0.75, 0.5, 0.25]], [0.5, [0.92, 0.7, 0.5, 0.3, 0.08]], [0.25, [0.65, 0.35]]],
  '3-4-2-1': [[0.74, [0.75, 0.5, 0.25]], [0.54, [0.85, 0.62, 0.38, 0.15]], [0.35, [0.68, 0.32]], [0.2, [0.5]]],
  '5-3-2': [[0.74, [0.92, 0.71, 0.5, 0.29, 0.08]], [0.5, [0.75, 0.5, 0.25]], [0.26, [0.65, 0.35]]],
  '5-4-1': [[0.74, [0.92, 0.71, 0.5, 0.29, 0.08]], [0.48, [0.85, 0.62, 0.38, 0.15]], [0.24, [0.5]]],
};
export const FORMATION_NAMES = Object.keys(FORMATIONS);
export const LINES = ['GK', 'DEF', 'MID', 'FWD'];

// Any formation text ("3-1-4-2"): lines spread evenly, players spread across
export function formationRows(f) {
  if (own(FORMATIONS, f)) return FORMATIONS[f];
  const lines = String(f || '').split('-').map(Number).filter((n) => n > 0 && n < 7);
  if (!lines.length || lines.reduce((a, b) => a + b, 0) !== 10) return FORMATIONS['4-3-3'];
  return lines.map((n, i) => [lines.length === 1 ? 0.5 : 0.74 - (i * 0.52) / (lines.length - 1), n === 1 ? [0.5] : Array.from({ length: n }, (_, k) => 0.88 - (k * 0.76) / (n - 1))]);
}

// Every position of a formation in order (keeper, then each line from the back,
// right → left): its name, which line it belongs to, and where it sits on a
// vertical pitch (x: 0 left – 1 right, y: 0 top/attacking – 1 own goal).
export function formationSlots(f) {
  const rows = formationRows(f), n = rows.length;
  const out = [{ role: 'GK', line: 0, x: 0.5, y: 0.9 }];
  const names = (k, cnt) => {
    if (k === 0) return { 3: ['RCB', 'CB', 'LCB'], 4: ['RB', 'RCB', 'LCB', 'LB'], 5: ['RWB', 'RCB', 'CB', 'LCB', 'LWB'] }[cnt] || Array(cnt).fill('CB');
    if (k === n - 1) return { 1: ['ST'], 2: ['RS', 'LS'], 3: ['RW', 'ST', 'LW'] }[cnt] || Array(cnt).fill('ST');
    const deep = k === 1 && n > 3, high = k === n - 2 && n > 3;
    if (deep) return { 1: ['DM'], 2: ['RDM', 'LDM'], 3: ['RDM', 'DM', 'LDM'], 4: ['RM', 'RCM', 'LCM', 'LM'] }[cnt] || Array(cnt).fill('DM');
    if (high) return { 1: ['AM'], 2: ['RAM', 'LAM'], 3: ['RW', 'AM', 'LW'], 4: ['RM', 'RCM', 'LCM', 'LM'] }[cnt] || Array(cnt).fill('AM');
    return { 2: ['RCM', 'LCM'], 3: ['RCM', 'CM', 'LCM'], 4: ['RM', 'RCM', 'LCM', 'LM'], 5: ['RWB', 'RCM', 'CM', 'LCM', 'LWB'] }[cnt] || Array(cnt).fill('CM');
  };
  rows.forEach(([y, xs], k) => {
    const nm = names(k, xs.length);
    const line = k === 0 ? 1 : k === n - 1 ? 3 : 2;
    // gap: room to the nearest team-mate in the same row (so names never run into each other)
    xs.forEach((x, i) => out.push({ role: nm[i], line, x, y, row: k, rows: n, gap: Math.min(...xs.filter((_, j) => j !== i).map((o) => Math.abs(o - x)), 0.5) }));
  });
  return out;
}

// Where a position is drawn on the half-pitch picture (Liverpool's half, attacking upwards):
// the pitch shows the halfway line near the top and our goal line near the bottom, to scale
// top to bottom: 1 metre = PITCH.m % of the pitch's height. The back line stands on the edge of
// the penalty box (17.5 m out), the striker just below the centre spot (about 52 m out), the
// keeper in the six-yard box. Formation positions (y: 0.74 back line → 0.2 striker) map in between.
// The rows in between are spread evenly, so there's always room for a face and a name.
export const PITCH = { goal: 96, half: 12, m: 1.6, back: 17.5, front: 52.3, keeper: 4, squeeze: 0.88 };
export function pitchDepth(slot) {
  if (slot.line === 0) return PITCH.keeper;
  if (slot.rows > 1 && slot.row != null) return PITCH.back + (slot.row * (PITCH.front - PITCH.back)) / (slot.rows - 1);
  return Math.max(PITCH.back, Math.min(PITCH.front, 65.2 - 64.4 * slot.y));
}
export function pitchPos(slot) {
  const top = PITCH.goal - pitchDepth(slot) * PITCH.m;
  // wide players come in a little from the touchline, so their names fit on the pitch
  const x = 0.5 + (slot.x - 0.5) * PITCH.squeeze;
  const room = Math.min((slot.gap ?? 0.5) * PITCH.squeeze, 2 * x, 2 * (1 - x), 0.5);
  const w = Math.max(0, room * 100 - 1);
  return `left:${(x * 100).toFixed(1)}%;top:${top.toFixed(1)}%;width:${w.toFixed(1)}%`;
}
// the markings, shared by every pitch on the site
export const PITCH_LINES = '<div class="pitch-lines" aria-hidden="true"><span class="pl-half"></span><span class="pl-circle"></span><span class="pl-cspot"></span><span class="pl-arc"></span><span class="pl-box"></span><span class="pl-six"></span><span class="pl-pspot"></span></div>';

// Moves a team into another formation, keeping each player in the same part
// of the pitch where possible (keeper, defence, midfield, attack).
export function remapXI(xi, from, to) {
  const old = formationSlots(from), next = formationSlots(to);
  const pools = [[], [], [], []];
  xi.forEach((id, i) => { if (id && old[i]) pools[old[i].line].push(id); });
  const out = next.map((s) => pools[s.line].shift() || null);
  const spare = pools.flat();
  for (let i = 0; i < out.length; i++) if (!out[i] && spare.length && next[i].line !== 0) out[i] = spare.shift();
  return out;
}

// The listed formation closest to any formation ESPN reports (e.g. 3-4-1-2 → 3-4-2-1)
export function nearestFormation(f) {
  if (own(FORMATIONS, f)) return f;
  const parts = String(f || '').split('-').map(Number);
  if (parts.length < 3 || parts.some((n) => !(n > 0)) || parts.reduce((a, b) => a + b, 0) !== 10) return '4-3-3';
  const count = (g) => { const p = g.split('-').map(Number); return [p[0], p.slice(1, -1).reduce((a, b) => a + b, 0), p[p.length - 1]]; };
  const want = count(f);
  let best = '4-3-3', score = Infinity;
  for (const g of FORMATION_NAMES) {
    const c = count(g);
    const d = Math.abs(c[0] - want[0]) * 3 + Math.abs(c[2] - want[2]) * 2 + Math.abs(c[1] - want[1]) + (g.split('-').length === f.split('-').length ? 0 : 0.5);
    if (d < score) { score = d; best = g; }
  }
  return best;
}

// Flappy Jim's rating colours: green (8+) → red (under 5)
export const ratingColor = (r) => (r >= 8 ? '#16a34a' : r >= 7 ? '#65a30d' : r >= 6 ? '#ca8a04' : r >= 5 ? '#ea580c' : '#dc2626');

// ---- checking what a visitor sends ------------------------------------------------
export const VOTER_RE = /^[a-z0-9-]{16,64}$/i;
const ID_RE = /^[a-z0-9-]{1,80}$/;

/** A line-up vote: { formation, xi: [11 player ids, slot order], captain? } */
export function cleanLineupVote(input, squadIds) {
  const v = input && typeof input === 'object' ? input : {};
  const allowed = new Set(squadIds);
  const formation = String(v.formation || '');
  if (!own(FORMATIONS, formation)) return { error: 'Pick one of the listed formations.' };
  if (!Array.isArray(v.xi) || v.xi.length !== 11) return { error: 'Pick 11 players.' };
  const xi = v.xi.map((x) => String(x || ''));
  if (xi.some((x) => !ID_RE.test(x) || !allowed.has(x))) return { error: 'Every player must come from the squad list.' };
  if (new Set(xi).size !== 11) return { error: 'Each player can only be picked once.' };
  const captain = v.captain && xi.includes(String(v.captain)) ? String(v.captain) : null;
  return { vote: { formation, xi, captain } };
}

/** A ratings vote: { r: { playerId: 1–10 in halves }, motm? } */
export function cleanRatingsVote(input, playerIds) {
  const v = input && typeof input === 'object' ? input : {};
  const allowed = new Set(playerIds);
  const r = {};
  for (const [id, raw] of Object.entries(v.r && typeof v.r === 'object' ? v.r : {})) {
    if (!allowed.has(id)) continue;
    const n = Math.round(Number(raw) * 2) / 2;
    if (Number.isFinite(n) && n >= 1 && n <= 10) r[id] = n;
  }
  if (!Object.keys(r).length) return { error: 'Rate at least one player.' };
  const motm = v.motm && allowed.has(String(v.motm)) ? String(v.motm) : null;
  return { vote: { r, motm } };
}

// ---- adding votes up ---------------------------------------------------------------
// (own-property checks, so no name can ever clash with JavaScript's built-ins)
const inc = (obj, key, d) => { obj[key] = (own(obj, key) ? obj[key] : 0) + d; };
const slot = (obj, key, make) => (own(obj, key) ? obj[key] : (obj[key] = make()));

export function emptyLineupAgg() { return { n: 0, formations: {}, players: {}, captains: {} }; }
export function addLineupVote(agg, vote, sign = 1) {
  const slots = formationSlots(vote.formation);
  agg.n += sign;
  inc(agg.formations, vote.formation, sign);
  vote.xi.forEach((id, i) => {
    const s = slots[i];
    const p = slot(agg.players, id, () => ({ n: 0, lines: [0, 0, 0, 0], x: 0, y: 0 }));
    p.n += sign; p.lines[s.line] += sign; p.x += s.x * sign; p.y += s.y * sign;
  });
  if (vote.captain) inc(agg.captains, vote.captain, sign);
  return agg;
}

export function emptyRatingsAgg() { return { n: 0, players: {}, motm: {} }; }
export function addRatingsVote(agg, vote, sign = 1) {
  agg.n += sign;
  for (const [id, v] of Object.entries(vote.r)) {
    const p = slot(agg.players, id, () => ({ s: 0, c: 0 }));
    p.s += v * sign; p.c += sign;
  }
  if (vote.motm) inc(agg.motm, vote.motm, sign);
  return agg;
}

const top = (obj) => Object.entries(obj || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || null;

/**
 * The fans' combined XI: the most popular formation, filled line by line with
 * the players picked most often for that part of the pitch, each placed where
 * fans usually put them. Returns { formation, xi: [ids in slot order], pct: {id: 0–100} }.
 */
export function fansXI(agg) {
  if (!agg || agg.n <= 0) return null;
  const formation = top(agg.formations) || '4-3-3';
  const slots = formationSlots(formation);
  const need = [0, 0, 0, 0];
  for (const s of slots) need[s.line]++;
  const cand = [];
  for (const [id, p] of Object.entries(agg.players)) p.lines.forEach((c, line) => { if (c > 0) cand.push([c, p.n, id, line]); });
  cand.sort((a, b) => b[0] - a[0] || b[1] - a[1] || a[2].localeCompare(b[2]));
  const chosen = [[], [], [], []], used = new Set();
  for (const [, , id, line] of cand) {
    if (used.has(id) || chosen[line].length >= need[line]) continue;
    chosen[line].push(id); used.add(id);
  }
  // fill any gaps (few votes) with the most-picked players left over
  const rest = Object.entries(agg.players).filter(([id, p]) => !used.has(id) && p.n > 0).sort((a, b) => b[1].n - a[1].n).map(([id]) => id);
  for (let line = 0; line < 4; line++) while (chosen[line].length < need[line] && rest.length) { const id = rest.shift(); chosen[line].push(id); used.add(id); }
  // within a line: deeper players to deeper rows, then right → left as fans placed them
  const xi = [];
  for (let line = 0; line < 4; line++) {
    const lineSlots = slots.map((s, i) => ({ ...s, i })).filter((s) => s.line === line);
    const avg = (id, k) => { const p = agg.players[id]; return p && p.n > 0 ? p[k] / p.n : 0.5; };
    const byDepth = [...chosen[line]].sort((a, b) => avg(b, 'y') - avg(a, 'y'));
    const rows = [...new Set(lineSlots.map((s) => s.y))].sort((a, b) => b - a);
    let k = 0;
    for (const y of rows) {
      const rowSlots = lineSlots.filter((s) => s.y === y).sort((a, b) => b.x - a.x);
      const group = byDepth.slice(k, k + rowSlots.length).sort((a, b) => avg(b, 'x') - avg(a, 'x'));
      k += rowSlots.length;
      rowSlots.forEach((s, j) => { xi[s.i] = group[j] || null; });
    }
  }
  const pct = {};
  for (const [id, p] of Object.entries(agg.players)) pct[id] = Math.round((100 * p.n) / agg.n);
  return { formation, xi, pct, captain: top(agg.captains) };
}

// Fans' average ratings, highest first: [{ id, avg, votes }]
export function ratingsTable(agg) {
  if (!agg) return [];
  return Object.entries(agg.players).filter(([, p]) => p.c > 0)
    .map(([id, p]) => ({ id, avg: Math.round((p.s / p.c) * 10) / 10, votes: p.c }))
    .sort((a, b) => b.avg - a.avg || b.votes - a.votes || a.id.localeCompare(b.id));
}
export const motmWinner = (agg) => {
  const id = top(agg?.motm);
  if (!id) return null;
  const total = Object.values(agg.motm).reduce((a, b) => a + Math.max(0, b), 0);
  return { id, pct: total ? Math.round((100 * agg.motm[id]) / total) : 0 };
};
