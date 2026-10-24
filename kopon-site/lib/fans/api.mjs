// GET/POST /api/fans — saves fans' line-ups and player ratings, and adds them up.
//
//   GET  ?kind=lineup&match=ID    → the fans' combined picks for that match
//   GET  ?kind=ratings&match=ID   → fans' average ratings (+ Kop On's official ones)
//   POST { kind: 'lineup',  match, voter, formation, xi, captain }
//   POST { kind: 'ratings', match, voter, r: { playerId: rating }, motm }
//   POST { kind: 'login', password }                       → a 12-hour manager token
//   POST { kind: 'official', match, token, r, motm, note }  (site manager)
//
// Each visitor's choice is its own record (votes/<kind>/<match>/<voter>), so
// saving again simply replaces it. Saving also updates the totals straight
// away; every 10 minutes they're recounted from the records to put right
// anything two simultaneous saves might have tangled. An hour after voting
// closes they're counted one last time and never again.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { passwordOk } from '../editor.mjs';
import {
  cleanLineupVote, cleanRatingsVote, VOTER_RE,
  emptyLineupAgg, addLineupVote, emptyRatingsAgg, addRatingsVote,
} from '../../src/assets/fans-core.js';

const MATCH_RE = /^[0-9a-z-]{1,24}$/i;
const RECOUNT_MS = 10 * 60000;
const BIG = 3000;                   // above this many records, trust the running totals instead of recounting
const MAX_VOTES = 25000;            // per match: plenty for a fan site, a ceiling for anyone stuffing
const MAX_VOTERS_PER_IP = 6;        // a household or a pub's wifi, not a bot
const MAX_MANAGER_TRIES = 12;       // password attempts per connection per hour
const TOKEN_HOURS = 12;
const MAX_BODY = 8000;

const json = (status, body, cache = 'no-store') => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache, ...(cache === 'no-store' ? {} : { 'Netlify-CDN-Cache-Control': 'public, s-maxage=20, stale-while-revalidate=40' }) },
});
const sha = (s) => createHash('sha256').update(String(s)).digest('hex').slice(0, 32);

// The connection a request came from. IPv6 users get a whole block of addresses
// each, so they're counted by their block (the first half of the address).
export function connectionOf(req, context) {
  const ip = String(context?.ip || req.headers.get('x-nf-client-connection-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0] || 'unknown').trim().toLowerCase();
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.split('::');
  const a = head ? head.split(':') : [], b = tail ? tail.split(':') : [];
  const full = [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b];
  return full.slice(0, 4).map((x) => x.replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

// A secret ingredient for scrambling connections, made once and kept in the store
// (or FANS_SALT if set), so the scrambled values can't be reversed from outside.
async function saltOf(store, env) {
  if (env.FANS_SALT) return env.FANS_SALT;
  const s = await store.get('meta/salt', { type: 'json' }).catch(() => null);
  if (s?.salt) return s.salt;
  const salt = randomBytes(24).toString('hex');
  await store.setJSON('meta/salt', { salt }).catch(() => {});
  return salt;
}

// Counting attempts: each one writes its own record first and then counts, so a
// burst of simultaneous requests can't all slip under the limit.
async function overLimit(store, prefix, limit, windowMs, now) {
  await store.setJSON(`${prefix}/${now}-${randomBytes(4).toString('hex')}`, { t: now }).catch(() => {});
  const { blobs } = await store.list({ prefix: `${prefix}/` }).catch(() => ({ blobs: [] }));
  let n = 0;
  const old = [];
  for (const b of blobs) { const t = parseInt(b.key.slice(prefix.length + 1), 10); if (now - t < windowMs) n++; else old.push(b.key); }
  await Promise.all(old.slice(0, 20).map((k) => store.delete(k).catch(() => {})));
  return n > limit;
}

// Manager tokens, so the password itself isn't kept in the browser
export function makeToken(password, now) {
  const exp = now + TOKEN_HOURS * 3600000;
  return `${exp}.${createHmac('sha256', password).update(`kopon-manager|${exp}`).digest('hex')}`;
}
export function tokenOk(token, password, now) {
  const [exp, mac] = String(token || '').split('.');
  if (!password || !/^\d{10,16}$/.test(exp || '') || !/^[0-9a-f]{64}$/.test(mac || '') || +exp < now) return false;
  const want = createHmac('sha256', password).update(`kopon-manager|${exp}`).digest();
  return timingSafeEqual(Buffer.from(mac, 'hex'), want);
}

async function readAll(store, keys, limit = 32) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, keys.length) }, async () => {
    while (i < keys.length) { const k = keys[i++]; const v = await store.get(k, { type: 'json' }).catch(() => null); if (v) out.push(v); }
  }));
  return out;
}

/**
 * Totals for one match. `known` = the match is one the site lists;
 * `closesAt` = when voting closed (or closes) for it.
 */
export async function totals(store, kind, match, { now = Date.now(), known = true, closesAt = 0 } = {}) {
  const key = `agg/${kind}/${match}`;
  const cached = await store.get(key, { type: 'json' }).catch(() => null);
  const empty = () => ({ ...(kind === 'lineup' ? emptyLineupAgg() : emptyRatingsAgg()), t: now, final: false });
  const final = !!closesAt && now > closesAt + 3600000;
  // final totals stay final, unless voting has opened again (e.g. a postponed match)
  if (cached && ((cached.final && (!closesAt || final)) || (!cached.final && now - cached.t < RECOUNT_MS))) return cached;
  // a match the site doesn't list: show what's there, but never go counting for it
  if (!known) return cached || empty();
  const { blobs } = await store.list({ prefix: `votes/${kind}/${match}/` });
  if (blobs.length > BIG && cached && !final) {
    const kept = { ...cached, t: now };
    await store.setJSON(key, kept).catch(() => {});
    return kept;
  }
  const votes = await readAll(store, blobs.map((b) => b.key));
  const agg = empty();
  for (const v of votes) {
    try { if (kind === 'lineup') addLineupVote(agg, v.vote); else addRatingsVote(agg, v.vote); } catch { /* skip a damaged record */ }
  }
  agg.final = final;
  if (votes.length || cached) await store.setJSON(key, agg).catch(() => {});
  return agg;
}

/**
 * deps: { store, env, loadConfig: () => fans.json, context, now }
 */
export { overLimit };

export async function handleFans(req, { store, env = {}, loadConfig, context = null, now = new Date() }) {
  const t = now.getTime();
  let cfg;
  try { cfg = await loadConfig(); } catch { return json(503, { error: 'The fan zone is starting up. Try again in a minute.' }); }
  const rateMatch = (id) => (cfg.rate || []).find((m) => m.matchId === id);
  // when voting closes for a match the site knows about (line-ups: kick-off)
  const closesFor = (kind, id) => {
    if (kind === 'lineup') {
      if (cfg.lineup?.matchId === id) return Date.parse(cfg.lineup.closes);
      const m = rateMatch(id);
      return m?.kickoff ? Date.parse(m.kickoff) : 0;
    }
    const m = rateMatch(id);
    return m ? Date.parse(m.closes) : 0;
  };

  if (req.method === 'GET') {
    const u = new URL(req.url);
    const kind = u.searchParams.get('kind'), match = u.searchParams.get('match') || '';
    if (!['lineup', 'ratings'].includes(kind) || !MATCH_RE.test(match)) return json(400, { error: 'Unknown request' });
    const closesAt = closesFor(kind, match);
    const agg = await totals(store, kind, match, { now: t, known: closesAt > 0, closesAt });
    const body = { kind, match, agg, open: closesAt > 0 && t < closesAt };
    if (kind === 'ratings') body.official = await store.get(`official/${match}`, { type: 'json' }).catch(() => null);
    return json(200, body, 'public, max-age=0, must-revalidate');
  }
  if (req.method !== 'POST') return json(405, { error: 'Use GET or POST' });

  // Only this site's own pages may send: other websites can't make their
  // visitors' browsers vote (a JSON request from another site is blocked by the browser)
  if (!/^application\/json\b/i.test(req.headers.get('content-type') || '')) return json(415, { error: 'Please send this from the Kop On website.' });
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin) return json(403, { error: 'Please send this from the Kop On website.' });
  if (+(req.headers.get('content-length') || 0) > MAX_BODY) return json(413, { error: 'That is too much to save.' });
  const text = await req.text();
  if (text.length > MAX_BODY) return json(413, { error: 'That is too much to save.' });
  let body;
  try { body = JSON.parse(text); } catch { return json(400, { error: 'Something went wrong sending that. Please try again.' }); }
  const kind = body?.kind, match = String(body?.match || '');
  const salt = await saltOf(store, env);
  const conn = sha(`${salt}|${connectionOf(req, context)}`);

  // ---- the site manager ------------------------------------------------------------
  if (kind === 'login' || kind === 'official') {
    if (!env.EDITOR_PASSWORD) return json(503, { error: 'The manager password (EDITOR_PASSWORD) hasn\'t been set up in Netlify yet.' });
    const viaToken = kind === 'official' && tokenOk(body.token, env.EDITOR_PASSWORD, t);
    if (!viaToken) {
      if (await overLimit(store, `tries/${conn}`, MAX_MANAGER_TRIES, 3600000, t)) return json(429, { error: 'Too many password attempts. Try again in an hour.' });
      if (!passwordOk(body.password, env.EDITOR_PASSWORD)) return json(401, { error: 'That password isn\'t right.' });
    }
    if (kind === 'login') return json(200, { ok: true, token: makeToken(env.EDITOR_PASSWORD, t) });
    const m = rateMatch(match);
    if (!m) return json(404, { error: 'That match isn\'t open for ratings.' });
    const empty = (!body.r || !Object.keys(body.r).length) && !body.motm;
    if (empty) { await store.delete(`official/${match}`); return json(200, { ok: true, official: null }); }
    const c = cleanRatingsVote(body, m.players);
    if (c.error) return json(400, { error: c.error });
    const note = String(body.note || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 400);
    const official = { ...c.vote, note, t: now.toISOString() };
    await store.setJSON(`official/${match}`, official);
    return json(200, { ok: true, official });
  }

  // ---- fans ----------------------------------------------------------------------------
  if (!['lineup', 'ratings'].includes(kind)) return json(400, { error: 'Unknown request' });
  const voter = String(body.voter || '');
  if (!VOTER_RE.test(voter)) return json(400, { error: 'Please reload the page and try again.' });
  let vote;
  if (kind === 'lineup') {
    const L = cfg.lineup;
    if (!L || L.matchId !== match) return json(409, { error: 'This match isn\'t open for line-ups any more. Reload the page for the next one.' });
    if (t >= Date.parse(L.closes)) return json(409, { error: 'Line-ups have closed for this match.' });
    const c = cleanLineupVote(body, L.squad);
    if (c.error) return json(400, { error: c.error });
    vote = c.vote;
  } else {
    const m = rateMatch(match);
    if (!m) return json(409, { error: 'This match isn\'t open for ratings.' });
    if (t >= Date.parse(m.closes)) return json(409, { error: 'Ratings for this match have closed.' });
    const c = cleanRatingsVote(body, m.players);
    if (c.error) return json(400, { error: c.error });
    vote = c.vote;
  }
  const voteKey = `votes/${kind}/${match}/${voter}`;
  const aggKey = `agg/${kind}/${match}`;
  const [before, cached] = await Promise.all([store.get(voteKey, { type: 'json' }).catch(() => null), store.get(aggKey, { type: 'json' }).catch(() => null)]);
  if (!before) {
    if (cached && cached.n >= MAX_VOTES) return json(429, { error: 'Picks for this match are full up. Thanks for taking part!' });
    // a few different people per connection per day, then no more
    const day = now.toISOString().slice(0, 10);
    const ipBlob = `ip/${kind}/${match}/${sha(`${salt}|${day}|${connectionOf(req, context)}`)}`;
    const seen = (await store.get(ipBlob, { type: 'json' }).catch(() => null)) || { voters: [] };
    if (!seen.voters.includes(voter)) {
      if (seen.voters.length >= MAX_VOTERS_PER_IP) return json(429, { error: 'Lots of picks have come from your connection today, so we can\'t take another one. Try again tomorrow.' });
      seen.voters.push(voter);
      await store.setJSON(ipBlob, seen).catch(() => {});
    }
  }
  await store.setJSON(voteKey, { vote, t: now.toISOString() });
  // Update the totals straight away (take off this person's old pick, add the new
  // one), so they see themselves counted. Two saves at the same moment can tangle
  // this; the recount every 10 minutes puts it right.
  let agg;
  if (cached && !cached.final) {
    agg = cached;
    try {
      const add = kind === 'lineup' ? addLineupVote : addRatingsVote;
      if (before?.vote) add(agg, before.vote, -1);
      add(agg, vote, 1);
      await store.setJSON(aggKey, agg);
    } catch { /* the next recount fixes it */ }
  } else {
    agg = await totals(store, kind, match, { now: t, known: true, closesAt: closesFor(kind, match) });
  }
  return json(200, { ok: true, saved: vote, agg });
}
