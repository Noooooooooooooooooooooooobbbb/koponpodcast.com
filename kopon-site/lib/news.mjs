// Fetches and merges LFC news headlines from several RSS/Atom feeds.
// Used both at build time (to bake headlines into the HTML) and by the
// /api/news function (to keep them fresh between builds).
import { parseXml, child, children, find, textOf, htmlOf, textChild } from './xml.mjs';
import { plainText, parseDate, safeUrl } from './text.mjs';
import { sortByDate, pickDiverse } from '../src/assets/news-render.js';

export { sortByDate, pickDiverse };

const UA = 'Mozilla/5.0 (compatible; KopOnNews/1.0; +https://kop-on-podcast.netlify.app/news/)';
const ACCEPT = 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5';
const MAX_BYTES = 6 * 1024 * 1024;

const isImageUrl = (u) => /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u);

function imageFrom(item) {
  const candidates = [];
  const push = (u) => { const s = safeUrl(u); if (s) candidates.push(s); };
  for (const mc of children(item, 'media:content')) {
    const t = mc.attrs.type || '', med = mc.attrs.medium || '';
    if (med === 'image' || t.startsWith('image/') || (!t && !med && isImageUrl(mc.attrs.url || ''))) push(mc.attrs.url);
    const thumb = child(mc, 'media:thumbnail');
    if (thumb) push(thumb.attrs.url);
  }
  for (const t of children(item, 'media:thumbnail')) push(t.attrs.url);
  const group = child(item, 'media:group');
  if (group) {
    for (const t of children(group, 'media:thumbnail')) push(t.attrs.url);
    for (const mc of children(group, 'media:content')) if ((mc.attrs.medium || '') === 'image' || (mc.attrs.type || '').startsWith('image/')) push(mc.attrs.url);
  }
  for (const enc of children(item, 'enclosure')) if ((enc.attrs.type || '').startsWith('image/') || isImageUrl(enc.attrs.url || '')) push(enc.attrs.url);
  if (!candidates.length) {
    const html = htmlOf(child(item, 'content:encoded')) + htmlOf(child(item, 'description')) + htmlOf(child(item, 'content'));
    const m = html.match(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i);
    if (m) push(m[1].replace(/&amp;/g, '&'));
  }
  return candidates[0] || null;
}

function linkFrom(item) {
  const links = children(item, 'link');
  for (const l of links) {
    if (l.attrs.href && (!l.attrs.rel || l.attrs.rel === 'alternate')) return safeUrl(l.attrs.href);
  }
  for (const l of links) {
    const t = textOf(l).trim();
    if (t) return safeUrl(t);
    if (l.attrs.href) return safeUrl(l.attrs.href);
  }
  const guid = child(item, 'guid');
  if (guid && guid.attrs.isPermaLink !== 'false') return safeUrl(textOf(guid).trim());
  return '';
}

export function parseNewsFeed(xml, source = {}) {
  const doc = parseXml(xml);
  const channel = find(doc, 'channel');
  const feed = channel || find(doc, 'feed');
  if (!feed) return [];
  const items = channel ? children(channel, 'item') : children(feed, 'entry');
  // Some RSS 1.0 feeds put items next to the channel
  if (channel && !items.length) items.push(...children(find(doc, 'rdf:RDF'), 'item'));

  const out = [];
  for (const item of items) {
    const title = plainText(textChild(item, 'title'));
    const url = linkFrom(item);
    if (!title || !url) continue;
    const date = parseDate(textChild(item, 'pubDate', 'published', 'updated', 'dc:date', 'a10:updated'));
    out.push({
      title: title.length > 220 ? title.slice(0, 217) + '…' : title,
      url,
      date: date ? date.toISOString() : null,
      source: source.name || '',
      sourceId: source.id || '',
      image: imageFrom(item),
    });
  }
  return out;
}

const titleKey = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '');
const urlKey = (u) => u.replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/^https?:\/\/(www\.)?/i, '').toLowerCase();

export function dedupe(items) {
  const seenT = new Set(), seenU = new Set(), out = [];
  for (const it of items) {
    const t = titleKey(it.title), u = urlKey(it.url);
    if (seenT.has(t) || seenU.has(u)) continue;
    seenT.add(t); seenU.add(u);
    out.push(it);
  }
  return out;
}

async function fetchText(url, fetchImpl, timeoutMs) {
  // Our own timer (not AbortSignal.timeout) so the timeout also covers
  // reading the body, and always fires even if nothing else is pending.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('Timed out', 'TimeoutError')), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': UA, Accept: ACCEPT },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error('Feed too large');
    return text;
  } catch (err) {
    if (ctrl.signal.aborted) throw new DOMException('Timed out', 'TimeoutError');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function loadSource(src, opts) {
  const errors = [];
  const urls = src.urls || (src.url ? [src.url] : []);
  for (const entry of urls) {
    const url = typeof entry === 'string' ? entry : entry.url;
    const keywords = ((typeof entry === 'object' && entry.keywords) || src.keywords || []).map((k) => k.toLowerCase());
    try {
      const xml = await fetchText(url, opts.fetch, opts.timeoutMs);
      let items = parseNewsFeed(xml, src);
      if (keywords.length) items = items.filter((it) => keywords.some((k) => it.title.toLowerCase().includes(k)));
      if (items.length) return { items, url, errors };
      errors.push(`${url}: no matching items`);
    } catch (err) {
      errors.push(`${url}: ${err?.name === 'TimeoutError' ? 'timed out' : err?.message || err}`);
    }
  }
  return { items: [], url: null, errors };
}

/**
 * @param {Array<{id:string,name:string,homepage?:string,urls:string[],keywords?:string[]}>} sources
 */
export async function fetchAllNews(sources, opts = {}) {
  const o = {
    fetch: opts.fetch || globalThis.fetch,
    timeoutMs: opts.timeoutMs ?? 6000,
    perSource: opts.perSource ?? 12,
    max: opts.max ?? 60,
    maxAgeDays: opts.maxAgeDays ?? 30,
    now: opts.now ? new Date(opts.now) : new Date(),
  };
  const results = await Promise.all(sources.map((s) => loadSource(s, o)));
  const cutoff = o.now.getTime() - o.maxAgeDays * 86400000;
  let all = [];
  const status = sources.map((s, i) => {
    const r = results[i];
    const fresh = sortByDate(r.items)
      .filter((it) => !it.date || Date.parse(it.date) >= cutoff)
      // Ignore items dated in the future by more than a day (bad clocks)
      .filter((it) => !it.date || Date.parse(it.date) <= o.now.getTime() + 86400000)
      .slice(0, o.perSource);
    all.push(...fresh);
    return { id: s.id, name: s.name, homepage: s.homepage || '', ok: r.items.length > 0, count: fresh.length, errors: r.errors };
  });
  all = dedupe(sortByDate(all)).slice(0, o.max);
  return { updated: o.now.toISOString(), sources: status, items: all };
}
