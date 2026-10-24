// Everything the fan zone needs, worked out at build time from ESPN (free):
//  - Liverpool's squad for the line-up picker (number, position, flag, who's out)
//  - Liverpool's last starting XI (a starting point for the picker)
//  - the next opponent's predicted XI (from Flappy Jim: their latest line-up,
//    with anyone injured or suspended swapped for a bench player in the same part of the pitch)
//  - the recent matches fans can rate, with everyone who played
import * as E from '../stats/espn.mjs';
import { slugify } from '../text.mjs';
import { formationSlots } from '../../src/assets/fans-core.js';
import { attachFaces } from './faces.mjs';

const DAY = 86400000;
const API = E.API;

// G (keeper), D, M or F from ESPN's position codes (Flappy Jim)
export function posLetter(pos) {
  const p = String(pos || '').toUpperCase();
  if (!p) return '';
  if (p === 'G' || p === 'GK' || p === 'GOALKEEPER') return 'G';
  if (p === 'D' || p === 'DEFENDER' || /^(CB|CD|SW|RB|LB|RWB|LWB|WB)(-|$)/.test(p)) return 'D';
  if (p === 'M' || p === 'MIDFIELDER' || /^(DM|CM|AM|RM|LM|CDM|CAM)(-|$)/.test(p)) return 'M';
  if (p === 'F' || p === 'FORWARD' || p === 'ATTACKER' || /^(CF|ST|S|SS|RW|LW|W|RF|LF)(-|$)/.test(p)) return 'F';
  return '';
}
const LETTER_LINE = { G: 0, D: 1, M: 2, F: 3 };

// The name on the shirt-style label: "van Dijk", "Mac Allister", "Salah"
export function surname(name) {
  const w = String(name || '').trim().split(/\s+/);
  if (w.length <= 1) return w[0] || '';
  const last = w[w.length - 1];
  return w.length > 2 && /^(van|von|de|da|di|del|der|dos|le|la|el|al|ten|mac|mc)$/i.test(w[w.length - 2]) ? w.slice(-2).join(' ') : last;
}

// Where each ESPN position code sits: [depth from own goal (0–1), side (-1 left … +1 right)] (Flappy Jim)
const POS = {
  G: [0.06, 0], GK: [0.06, 0], SW: [0.22, 0],
  RB: [0.36, 0.8], LB: [0.36, -0.8], CB: [0.3, 0], CD: [0.3, 0], 'CD-R': [0.3, 0.32], 'CD-L': [0.3, -0.32], RWB: [0.5, 0.86], LWB: [0.5, -0.86],
  DM: [0.5, 0], 'DM-R': [0.5, 0.28], 'DM-L': [0.5, -0.28], CDM: [0.5, 0],
  CM: [0.62, 0], 'CM-R': [0.62, 0.34], 'CM-L': [0.62, -0.34], M: [0.62, 0], RM: [0.55, 0.8], LM: [0.55, -0.8],
  AM: [0.77, 0], 'AM-R': [0.77, 0.42], 'AM-L': [0.77, -0.42], CAM: [0.77, 0],
  RW: [0.86, 0.74], LW: [0.86, -0.74], W: [0.86, 0.74], SS: [0.84, 0],
  F: [0.93, 0], CF: [0.93, 0], ST: [0.93, 0], 'CF-R': [0.92, 0.3], 'CF-L': [0.92, -0.3], RF: [0.92, 0.3], LF: [0.92, -0.3],
};
const BROAD = { G: [0.06, 0], D: [0.3, 0], M: [0.62, 0], F: [0.93, 0] };
const where = (p) => POS[String(p.pos || '').toUpperCase()] || BROAD[posLetter(p.pos)] || null;
// formation slot → the same depth/side measure
const slotPoint = (s) => [s.line === 0 ? 0.06 : 0.3 + ((0.74 - s.y) / 0.52) * 0.62, (s.x - 0.5) * 2];

// Puts eleven players into a formation's positions from where they actually played (Flappy Jim)
export function orderForFormation(players, formation) {
  const slots = formationSlots(formation);
  if (players.length < 11 || players.slice(0, 11).filter(where).length < 9) return players.slice(0, 11);
  const xi = players.slice(0, 11).map((p) => (where(p) ? p : { ...p, pos: 'CM' }));
  const res = Array(11).fill(null), left = new Set(xi.map((_, i) => i));
  const gk = xi.findIndex((p) => where(p)[0] < 0.1);
  if (gk >= 0) { res[0] = xi[gk]; left.delete(gk); }
  const pairs = [];
  for (let s = res[0] ? 1 : 0; s < 11; s++) {
    const [sd, sl] = slotPoint(slots[s]);
    for (const i of left) { const [d, l] = where(xi[i]); pairs.push([Math.hypot((d - sd) * 3, l - sl) + Math.abs(i - s) * 0.02, s, i]); }
  }
  pairs.sort((a, b) => a[0] - b[0]);
  for (const [, s, i] of pairs) if (!res[s] && left.has(i)) { res[s] = xi[i]; left.delete(i); }
  for (let s = 0; s < 11; s++) if (!res[s]) { const i = left.values().next().value; res[s] = xi[i]; left.delete(i); }
  return res;
}

const validFormation = (f) => { const n = String(f || '').split('-').map(Number); return n.length >= 3 && n.every((x) => x > 0 && x < 7) && n.reduce((a, b) => a + b, 0) === 10; };

// One team's line-up in a finished match
export function lineupFor(sum, teamId) {
  const r = (sum?.rosters || []).find((x) => String(x.team?.id ?? '') === String(teamId));
  if (!r) return null;
  const one = (p) => ({ name: p.athlete?.displayName || p.athlete?.shortName || '', aid: String(p.athlete?.id ?? ''), num: String(p.jersey ?? ''), pos: String(p.position?.abbreviation || '').toUpperCase(), place: +p.formationPlace || 0, cameOn: !!(p.subbedIn || p.subbedInFor) });
  const list = (r.roster || []).filter((p) => p.athlete);
  const xi = list.filter((p) => p.starter).map(one).filter((p) => p.name).sort((a, b) => (a.place || 99) - (b.place || 99));
  if (xi.length < 11) return null;
  return { formation: validFormation(r.formation) ? r.formation : '', xi, subs: list.filter((p) => !p.starter).map(one).filter((p) => p.name) };
}

/** A team's predicted XI for a coming match (Flappy Jim's predictedLineup, at build time) */
export async function predictedXI(espn, team, fixtures, out, ev) {
  const done = (fixtures?.past || []).filter((e) => e.done);
  if (!done.length) return null;
  const sameComp = ev?.league ? done.slice(0, 5).find((e) => e.league === ev.league) : null;
  const order = [...new Set([sameComp, ...done.slice(0, 4)].filter(Boolean))];
  let last = null, lu = null, sum = null;
  for (const e of order) { sum = await E.summary(espn, e).catch(() => null); lu = sum && lineupFor(sum, team.id); if (lu) { last = e; break; } }
  if (!lu) return null;
  // sent off last time = banned this time
  const reds = (sum.keyEvents || []).filter((k) => /red card|second yellow/i.test(k.type?.text || '') && String(k.team?.id ?? '') === String(team.id))
    .map((k) => ({ name: k.participants?.[0]?.athlete?.displayName, why: 'Suspended', detail: 'sent off last game' })).filter((x) => x.name);
  const missing = [...(out || [])];
  for (const r of reds) if (!missing.some((o) => E.sameName(o.name, r.name))) missing.push(r);
  const isOut = (p) => missing.find((o) => E.sameName(o.name, p.name) && o.why !== 'Doubtful');
  const bench = lu.subs.filter((p) => !isOut(p));
  const changes = [];
  const xi = lu.xi.map((p) => {
    const o = isOut(p); if (!o) return { ...p };
    const g = posLetter(p.pos);
    const pickFrom = (list) => list.find((s) => s.cameOn) || list[0];
    const sub = pickFrom(bench.filter((s) => g && posLetter(s.pos) === g)) || (g === 'G' ? null : pickFrom(bench.filter((s) => posLetter(s.pos) !== 'G')));
    if (!sub) return { ...p, doubt: true };
    bench.splice(bench.indexOf(sub), 1);
    changes.push({ out: p.name, why: o.why, detail: o.detail || '', in: sub.name });
    return { ...sub, pos: p.pos, predicted: true };
  });
  const formation = lu.formation || '4-3-3';
  const opp = last.home.id === String(team.id) ? last.away : last.home;
  return {
    formation,
    xi: orderForFormation(xi, formation).map((p) => ({ name: p.name, short: surname(p.name), num: p.num, pos: p.pos, predicted: !!p.predicted, doubt: !!p.doubt })),
    changes,
    out: missing.map((o) => ({ name: o.name, why: o.why, detail: o.detail || '' })),
    basedOn: { opp: opp.shortName || opp.name, date: last.date, comp: last.league },
  };
}

// Liverpool's squad from ESPN's squad list, plus anyone who has played recently
async function squadFrom(espn, team, slug) {
  const j = await espn.get(`${API}${slug}/teams/${team.id}/roster`).catch(() => null);
  const athletes = (j?.athletes || []).flatMap((a) => (Array.isArray(a.items) ? a.items : [a]));
  const list = [];
  const add = (p) => {
    if (!p.name || list.some((x) => E.sameName(x.name, p.name))) return;
    list.push(p);
  };
  for (const a of athletes) {
    add({
      name: a.displayName || a.fullName || '', aid: String(a.id ?? ''), num: String(a.jersey ?? ''), letter: posLetter(a.position?.abbreviation || a.position?.name),
      flag: /^https:\/\//.test(a.flag?.href || '') ? a.flag.href : '', nation: a.citizenship || a.flag?.alt || '',
    });
  }
  return { list, fromRoster: list.length > 0 };
}

// Kick-off time not fixed yet: close picks at 11:30 UK time on matchday (before the earliest usual kick-off)
export function matchdayMorning(date) {
  const d = new Date(date);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  for (const off of ['+00:00', '+01:00']) {
    const t = new Date(`${day}T11:30:00${off}`);
    const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t);
    if (hm === '11:30') return t.toISOString();
  }
  return new Date(`${day}T10:30:00Z`).toISOString();
}

const matchSlug = (ev, opp) => `${String(ev.date).slice(0, 10)}-${slugify(opp.shortName || opp.name)}`;

/**
 * data: what buildStats has made so far (previews, results); mine: Liverpool's fixtures.
 * Returns { lineup, rate, squad } or throws (the caller logs it and carries on).
 */
export async function buildFans({ espn, fetchImpl, data, mine, cache, config, now = new Date(), log = () => {}, ownPhotos = {} }) {
  const fc = config.fans || {};
  const team = data.team;
  cache.fans ||= {};
  const evCache = (cache.fans.ev ||= {}); // finished matches: line-ups never change

  // ---- the squad ------------------------------------------------------------
  const next = data.previews?.[0] || null;
  const { list: roster } = await squadFrom(espn, team, 'eng.1');

  // ---- recent finished matches: who played (remembered between builds) -------
  const recent = mine.past.filter((e) => e.done && e.hs != null).slice(0, Math.max(1, fc.ratingsMatches || 5));
  const keep = new Set(mine.past.slice(0, 12).map((e) => e.id));
  for (const id of Object.keys(evCache)) if (!keep.has(id)) delete evCache[id];
  await Promise.all(recent.map(async (e) => {
    if (evCache[e.id]) return;
    const sum = await E.summary(espn, e).catch(() => null);
    if (!sum) return;
    const lu = lineupFor(sum, team.id);
    const lines = E.playerLines(sum, team.id) || [];
    if (!lu || !lines.length) return;
    evCache[e.id] = { formation: lu.formation || '4-3-3', xi: orderForFormation(lu.xi, lu.formation || '4-3-3').map((p) => ({ name: p.name, aid: p.aid, num: p.num, pos: p.pos })), subs: lu.subs.map((p) => ({ name: p.name, aid: p.aid, num: p.num, pos: p.pos, cameOn: p.cameOn })), lines };
  }));

  // squad = roster, plus anyone who has played lately but isn't on it (new signings)
  const squad = roster.map((p) => ({ ...p }));
  for (const e of recent) for (const p of [...(evCache[e.id]?.xi || []), ...(evCache[e.id]?.subs || [])]) {
    const find = () => (p.aid && squad.find((x) => x.aid === p.aid)) || squad.find((x) => E.sameName(x.name, p.name));
    if (!find()) squad.push({ name: p.name, aid: p.aid || '', num: p.num, letter: posLetter(p.pos), flag: '', nation: '' });
    const s = find();
    if (s && !s.num && p.num) s.num = p.num;
    if (s && !s.letter && posLetter(p.pos)) s.letter = posLetter(p.pos);
  }
  if (squad.length < 11) throw new Error(`only ${squad.length} players found for the squad`);

  // stable ids (also used by the votes): the player's name as a web address
  const used = new Set();
  for (const p of squad) { let id = slugify(p.name).slice(0, 70); while (used.has(id)) id += '-2'; used.add(id); p.id = id; p.club = team.name; p.short = surname(p.name); p.line = LETTER_LINE[p.letter] ?? 2; }
  // ESPN's own player id first (survives a name change), the name otherwise
  const idOf = (name, aid = '') => (aid && squad.find((x) => x.aid === aid)?.id) || squad.find((x) => E.sameName(x.name, name))?.id || null;

  // who's out for the next match
  const outNext = next ? (next.isHome ? next.out?.home : next.out?.away) || [] : [];
  for (const p of squad) {
    const o = outNext.find((x) => E.sameName(x.name, p.name));
    if (o) p.out = { why: o.why || 'Out', detail: o.detail || '' };
  }

  // ---- the line-up picker for the next match --------------------------------
  let lineup = null;
  if (next) {
    const lastId = recent.find((e) => evCache[e.id])?.id;
    const last = lastId ? evCache[lastId] : null;
    const lastEv = recent.find((e) => e.id === lastId);
    const lastXI = last ? { formation: last.formation, xi: last.xi.map((p) => idOf(p.name, p.aid)), vs: lastEv ? (lastEv.home.id === team.id ? lastEv.away : lastEv.home).shortName : '', date: lastEv?.date } : null;
    // the opposition
    let opp = null;
    try {
      const oppFix = await E.teamFixtures(espn, next.opp.id, now).catch(() => null);
      const oppOut = next.isHome ? next.out?.away : next.out?.home;
      opp = await predictedXI(espn, next.opp, oppFix, oppOut, next);
    } catch (err) { log(`  fans: no predicted line-up for ${next.opp.name} (${err.message})`); }
    lineup = {
      matchId: next.id, slug: next.slug, kickoff: next.date, tbc: next.tbc, closes: next.tbc ? matchdayMorning(next.date) : next.date, comp: next.comp, isHome: next.isHome, venue: next.venue,
      team: { name: team.name, logo: team.logo || '' }, opp: { name: next.opp.name, shortName: next.opp.shortName || next.opp.name, logo: next.opp.logo || '' },
      lastXI, oppXI: opp,
    };
  }

  // ---- matches to rate -------------------------------------------------------------
  const rate = [];
  for (const e of recent) {
    const c = evCache[e.id]; if (!c) continue;
    const home = e.home.id === team.id, opp = home ? e.away : e.home, gf = home ? e.hs : e.as, ga = home ? e.as : e.hs;
    const statsLine = (name) => c.lines.find((l) => E.sameName(l.n, name));
    const players = [];
    const push = (p, starter) => {
      const l = statsLine(p.name);
      if (!starter && !(p.cameOn || l)) return;
      const id = idOf(p.name, p.aid) || slugify(p.name).slice(0, 70);
      if (players.some((x) => x.id === id)) return;
      players.push({ id, name: p.name, short: surname(p.name), num: p.num, letter: posLetter(p.pos), starter, mins: l?.m ?? null, g: l?.g || 0, a: l?.a || 0, y: l?.y || 0, r: l?.r || 0, stat: l ? statRating(l, gf, ga) : null });
    };
    c.xi.forEach((p) => push(p, true));
    c.subs.forEach((p) => push(p, false));
    const closes = new Date(Date.parse(e.date) + (fc.ratingsOpenDays || 7) * DAY).toISOString();
    rate.push({ matchId: e.id, slug: matchSlug(e, opp), date: e.date, comp: e.league, home, gf, ga, r: gf > ga ? 'W' : gf < ga ? 'L' : 'D', opp: { name: opp.name, shortName: opp.shortName || opp.name, logo: opp.logo || '' }, formation: c.formation, players, opens: e.date, closes });
  }

  // ---- photos for everyone shown -------------------------------------------------
  const people = [...squad.map((p) => ({ name: p.name, club: team.name, ref: p }))];
  for (const m of rate) for (const p of m.players) if (!squad.some((s) => s.id === p.id)) people.push({ name: p.name, club: team.name, ref: p });
  if (lineup?.oppXI) for (const p of lineup.oppXI.xi) people.push({ name: p.name, club: lineup.opp.name, ref: p });
  if (fc.photos !== false) {
    await attachFaces(people, { fetchImpl, cache: (cache.fans.photos ||= {}), own: ownPhotos, now, maxLookups: fc.maxPhotoLookups ?? 40, log });
  } else {
    for (const p of people) p.photo = ownPhotos[slugify(p.name)] || '';
  }
  for (const p of people) { p.ref.photo = p.photo || ''; }
  const photoOf = new Map(squad.map((p) => [p.id, p.photo]));
  for (const m of rate) for (const p of m.players) p.photo ||= photoOf.get(p.id) || '';

  const order = { G: 0, D: 1, M: 2, F: 3, '': 4 };
  squad.sort((a, b) => order[a.letter || ''] - order[b.letter || ''] || (parseInt(a.num, 10) || 99) - (parseInt(b.num, 10) || 99) || a.name.localeCompare(b.name));
  return {
    squad: squad.map(({ club, aid, ...p }) => p),
    lineup,
    rate,
    updated: now.toISOString(),
  };
}

// Flappy Jim's rating from the match stats (6.0, then goals, assists, shots, saves, clean sheet, result, cards)
export function statRating(x, gf, ga) {
  const def = x.pos === 'Goalkeeper' || x.pos === 'Defender';
  let v = 6 + x.g * (def ? 1.4 : 1) + x.a * 0.75 + x.so * 0.25 + Math.max(0, x.sh - x.so) * 0.06 + (x.pos === 'Goalkeeper' ? x.sv * 0.35 : 0) + x.fd * 0.06 - x.fc * 0.07 - x.y * 0.35 - x.r * 1.6 - x.og;
  v += gf > ga ? 0.35 : gf < ga ? -0.35 : 0;
  if (def && x.st) v += ga === 0 ? 0.6 : -0.2 * ga;
  if (!x.st) v = 6 + (v - 6) * 0.6;
  return Math.round(Math.max(3, Math.min(10, v)) * 10) / 10;
}
