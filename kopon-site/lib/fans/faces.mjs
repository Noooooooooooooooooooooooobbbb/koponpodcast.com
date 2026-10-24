// Player photos for the fan zone, looked up at build time (ported from Flappy Jim's lib/faces.js).
//  1. FotMob: current-season head shots, checked against the player's club
//  2. TheSportsDB: head-and-shoulders cut-outs
//  3. Wikipedia / Wikimedia Commons (freely licensed)
// The browser loads the picture straight from where it lives; only the address is stored.
// Results are remembered between builds (in stats-cache.json): a found photo for 21 days,
// "nothing found" for 3 days, so a normal build makes no lookups at all.
//
// Your own photos always win: put a file in kopon-site/photos/ named after the player
// (e.g. photos/virgil-van-dijk.jpg), or list an address in site.config.mjs (playerPhotos).
import { slugify } from '../text.mjs';

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const WIKI_UA = 'KopOnPodcastSite/2.0 (https://koponpodcast.com)';
const REFRESH_DAYS = 21, RETRY_NONE_DAYS = 3;
const DAY = 86400000;

const plain = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['fc', 'afc', 'cf', 'sc', 'ac', 'club', 'de', 'the', 'football', 'calcio', 'sv', 'fk', 'sk', 'cd', 'ud', 'rc', 'as', 'ss', 'and', 'hove', 'albion']);

// how well a club name matches (0 = not at all)
// youth, reserve and women's sides are different teams ("Liverpool U21" is not "Liverpool")
const SIDE = /\b(u\d{2}|under \d{2}|women|ladies|wfc|w|ii|b|reserves?|academy|youth|juniors?)\b/;
export function clubScore(a, b) {
  a = plain(a); b = plain(b); if (!a || !b) return 0;
  if (SIDE.test(a) !== SIDE.test(b)) return 0;
  if (a === b) return 3;
  if (a.includes(b) || b.includes(a)) return 2;
  const wa = a.split(' ').filter((w) => w.length > 2 && !STOP.has(w)), wb = new Set(b.split(' ').filter((w) => w.length > 2 && !STOP.has(w)));
  return wa.some((w) => wb.has(w)) ? 1 : 0;
}
// "R. Ngumoha" / "Ngumoha" / "Rio Ngumoha" all match "Rio Ngumoha"
export function nameScore(wanted, got) {
  const w = plain(wanted).split(' '), g = plain(got).split(' ');
  if (!w[0] || !g[0]) return 0;
  if (w.join(' ') === g.join(' ')) return 3;
  const ws = w[w.length - 1], gs = g[g.length - 1];
  if (ws !== gs && !g.includes(ws)) return 0;
  if (w.length === 1 || g.length === 1) return 1;
  // two different people who share a word ("Conor Bradley" is not "Bradley Barcola"):
  // the first names must agree too. A shared first initial only ("Joe"/"Jon Gomez",
  // "Andy"/"Andrew Robertson") is a weak match that also needs the exact club.
  if (ws !== gs && !g.includes(w[0])) return 0;
  if (w[0][0] !== g[0][0]) return 0;
  // "Andy Robertson" = "Andrew Robertson" only counts weakly: the club has to agree as well
  return w[0] === g[0] || w[0].length === 1 ? 2 : 1;
}

// FotMob's search answer has players with their current team in a few shapes
export function fotmobPlayers(j) {
  const out = [];
  const walk = (o, depth = 0) => {
    if (!o || depth > 6) return;
    if (Array.isArray(o)) { for (const x of o) walk(x, depth + 1); return; }
    if (typeof o !== 'object') return;
    if (typeof o.text === 'string' && o.payload && o.payload.teamName !== undefined && (o.payload.id || o.text.includes('|'))) {
      const [nm, id] = o.text.split('|');
      if (!o.payload.isCoach) out.push({ id: String(o.payload.id || id), name: nm, team: o.payload.teamName || '' });
    } else if ((o.type === 'player' || o.isPlayer) && o.id && (o.name || o.title)) {
      out.push({ id: String(o.id), name: o.name || o.title, team: o.teamName || o.team?.name || o.primaryTeamName || '' });
    }
    for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, depth + 1);
  };
  walk(j);
  return out.filter((p) => /^\d+$/.test(p.id));
}

async function getJson(fetchImpl, url, ua = BROWSER_UA) {
  const r = await fetchImpl(url, { headers: { 'User-Agent': ua, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  return r.json().catch(() => null);
}
// a real picture, not FotMob's blank silhouette (tiny file)
async function imageOk(fetchImpl, url) {
  const r = await fetchImpl(url, { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(8000) });
  if (!r.ok || !/image/.test(r.headers.get('content-type') || '')) return false;
  const buf = await r.arrayBuffer();
  return buf.byteLength >= 2500;
}

async function fotmob(fetchImpl, name, club) {
  const words = plain(name).split(' ');
  const surname = name.trim().split(/\s+/).pop();
  const terms = [...new Set([words.length === 1 ? surname : name, surname])];
  let best = null;
  for (const term of terms) {
    let list = [];
    for (const base of ['https://www.fotmob.com/api/search/suggest', 'https://apigw.fotmob.com/searchapi/suggest']) {
      try { const j = await getJson(fetchImpl, `${base}?term=${encodeURIComponent(term)}&lang=en`); list = j ? fotmobPlayers(j) : []; } catch { list = []; }
      if (list.length) break;
    }
    for (const p of list) {
      const ns = nameScore(name, p.name); if (!ns) continue;
      const cs = clubScore(club, p.team);
      const score = ns * 2 + cs * 3;
      if (!best || score > best.score) best = { ...p, score, cs };
    }
    if (best && best.cs >= 2) break;
  }
  if (!best) return null;
  if (club && best.cs === 0 && best.score < 6) return null; // plays somewhere else: probably the wrong person
  if (nameScore(name, best.name) === 1 && best.cs < 3) return null; // only the initial agrees: needs the exact club
  const url = `https://images.fotmob.com/image_resources/playerimages/${best.id}.png`;
  return (await imageOk(fetchImpl, url)) ? { url, src: 'fotmob' } : null;
}

async function sportsdb(fetchImpl, name, club) {
  const j = await getJson(fetchImpl, 'https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=' + encodeURIComponent(name.replace(/\s+/g, '_')));
  const list = (j?.player || []).filter((p) => !p.strSport || /soccer/i.test(p.strSport));
  let best = null;
  for (const p of list) {
    const ns = nameScore(name, p.strPlayer || ''); if (!ns) continue;
    const cs = clubScore(club, p.strTeam || '');
    const url = p.strCutout || p.strRender || p.strThumb;
    if (url && /^https:\/\//.test(url) && (!best || ns * 2 + cs * 3 > best.score)) best = { url, score: ns * 2 + cs * 3, cs };
  }
  if (!best || (club && best.cs === 0 && best.score < 6)) return null;
  if (best.score - best.cs * 3 === 2 && best.cs < 3) return null; // only the initial agrees: needs the exact club
  return (await imageOk(fetchImpl, best.url)) ? { url: best.url, src: 'sportsdb' } : null;
}

async function wikipedia(fetchImpl, name) {
  const q = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrsearch: `${name} footballer`, gsrlimit: '3', prop: 'pageimages|pageterms', piprop: 'thumbnail', pithumbsize: '320', pilicense: 'free', wbptterms: 'description', origin: '*' });
  const j = await getJson(fetchImpl, 'https://en.wikipedia.org/w/api.php?' + q, WIKI_UA);
  const pages = Object.values(j?.query?.pages || {}).sort((a, b) => a.index - b.index);
  const isFootballer = (p) => /football|soccer/i.test((p.terms?.description || []).join(' '));
  // the article's title (without "(footballer, born 2005)") must be this player's name:
  // "Ben Doak" is not "Kieran Doak", "Morgan Gibbs-White" is not "Calum White"
  const titleName = (p) => String(p.title || '').replace(/\s*\(.*\)\s*$/, '');
  const pick = pages.find((p) => p.thumbnail && isFootballer(p) && nameScore(name, titleName(p)) >= 2);
  const url = pick?.thumbnail?.source;
  return url && /^https:\/\/upload\.wikimedia\.org\//.test(url) ? { url, src: 'wiki' } : null;
}

export async function lookupFace(fetchImpl, name, club) {
  for (const f of [fotmob, sportsdb]) {
    try { const r = await f(fetchImpl, name, club); if (r) return r; } catch { /* next source */ }
  }
  try { return await wikipedia(fetchImpl, name); } catch { return null; }
}

/**
 * Adds a `photo` address to every player that has one.
 * people: [{ name, club }]; cache: object kept between builds; own: { slug: url } from the photos folder and config.
 */
export async function attachFaces(people, { fetchImpl, cache, own = {}, now = new Date(), maxLookups = 40, log = () => {} }) {
  cache.v = 1; cache.faces ||= {};
  const t = now.getTime();
  const todo = [];
  for (const p of people) {
    const mine = own[slugify(p.name)] || own[p.name];
    if (mine) { p.photo = mine; p.photoSrc = 'own'; continue; }
    const key = `${plain(p.name)}|${plain(p.club)}`;
    const hit = cache.faces[key];
    const age = hit ? (t - hit.t) / DAY : Infinity;
    if (hit?.url) p.photo = hit.url;
    const fresh = hit && (hit.url ? age < REFRESH_DAYS : age < RETRY_NONE_DAYS);
    if (!fresh && !todo.some((x) => x.key === key)) todo.push({ key, p });
  }
  const batch = todo.slice(0, maxLookups);
  let found = 0, i = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (i < batch.length) {
      const { key, p } = batch[i++];
      const r = await lookupFace(fetchImpl, p.name, p.club).catch(() => null);
      const prev = cache.faces[key];
      if (r) { cache.faces[key] = { url: r.url, src: r.src, t }; found++; }
      else if (prev?.url) cache.faces[key] = { ...prev, t }; // keep the old photo, look again later
      else cache.faces[key] = { url: '', t };
    }
  }));
  // everyone sharing a looked-up key gets the result
  for (const p of people) {
    if (p.photoSrc === 'own') continue;
    const hit = cache.faces[`${plain(p.name)}|${plain(p.club)}`];
    p.photo = hit?.url || '';
  }
  // forget people we haven't needed for a season
  for (const [k, v] of Object.entries(cache.faces)) if (t - v.t > 300 * DAY) delete cache.faces[k];
  if (batch.length) log(`  fans: looked up ${batch.length} player photo${batch.length === 1 ? '' : 's'} (${found} found)${todo.length > batch.length ? `, ${todo.length - batch.length} more next build` : ''}`);
  return people;
}
