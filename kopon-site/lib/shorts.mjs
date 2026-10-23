// YouTube Shorts for episode pages.
// YouTube publishes an automatic "Shorts only" playlist for every channel
// (its ID is the channel ID with "UC" swapped for "UUSH"), with an RSS feed
// of the newest 15. Each Short is matched to the episode it was posted after.
import { parseXml, find, children, child, textOf } from './xml.mjs';
import { plainText } from './text.mjs';

export const shortsFeedUrl = (channelId) =>
  /^UC[\w-]{22}$/.test(channelId || '') ? `https://www.youtube.com/feeds/videos.xml?playlist_id=UUSH${channelId.slice(2)}` : '';

// Accepts an 11-character ID or any YouTube link (shorts/, watch?v=, youtu.be/, embed/)
export function videoId(input) {
  const s = String(input ?? '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtube(?:-nocookie)?\.com\/(?:shorts\/|embed\/|live\/|watch\?(?:[^#]*&)?v=)|youtu\.be\/)([\w-]{11})(?![\w-])/i);
  return m ? m[1] : '';
}

export function parseShortsFeed(xml) {
  const feed = find(parseXml(xml), 'feed');
  if (!feed) return [];
  const out = [];
  for (const e of children(feed, 'entry')) {
    const link = children(e, 'link').find((l) => l.attrs.href)?.attrs.href || '';
    const id = videoId(textOf(child(e, 'yt:videoId')).trim()) || videoId(link);
    const published = Date.parse(textOf(child(e, 'published')).trim());
    if (!id || !Number.isFinite(published)) continue;
    out.push({ id, title: plainText(textOf(child(e, 'title')), 300).slice(0, 140), published: new Date(published).toISOString() });
  }
  return out;
}

// Previously seen Shorts + the latest feed, newest first, no duplicates.
export function mergeShorts(previous = [], fresh = [], max = 500) {
  const byId = new Map();
  for (const s of [...previous, ...fresh]) {
    if (s && /^[\w-]{11}$/.test(s.id || '') && Number.isFinite(Date.parse(s.published))) byId.set(s.id, { id: s.id, title: String(s.title || '').slice(0, 140), published: s.published });
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.published) - Date.parse(a.published)).slice(0, max);
}

/**
 * Returns Map(slug -> [{id, title}]).
 * - extra: { 'Episode title or address': ['youtube link or ID', ...] } — always shown, first
 * - hide:  ['youtube link or ID', ...] — never shown
 * - automatic: a Short belongs to the newest episode published before it
 *   (or up to `leadHours` after it, for teasers posted just before release).
 */
export function assignShorts(episodes, shorts, { perEpisode = 6, extra = {}, hide = [], leadHours = 12 } = {}) {
  const map = new Map(episodes.map((e) => [e.slug, []]));
  const hidden = new Set(hide.map(videoId).filter(Boolean));
  const used = new Set();
  const titles = new Map(shorts.map((s) => [s.id, s.title]));

  for (const [key, list] of Object.entries(extra || {})) {
    const k = String(key).trim().toLowerCase();
    const ep = episodes.find((e) => e.slug === k || e.title.toLowerCase() === k);
    if (!ep) continue;
    for (const raw of [].concat(list || [])) {
      const id = videoId(raw);
      if (!id || hidden.has(id) || used.has(id)) continue;
      used.add(id);
      map.get(ep.slug).push({ id, title: titles.get(id) || `${ep.title}: clip` });
    }
  }

  const sorted = [...episodes].filter((e) => e.date && e.date.getTime() > 0).sort((a, b) => b.date - a.date);
  for (const s of [...shorts].sort((a, b) => Date.parse(a.published) - Date.parse(b.published))) {
    if (hidden.has(s.id) || used.has(s.id)) continue;
    const t = Date.parse(s.published) + leadHours * 3600000;
    const ep = sorted.find((e) => e.date.getTime() <= t);
    if (!ep) continue;
    const list = map.get(ep.slug);
    if (list.length >= perEpisode) continue;
    used.add(s.id);
    list.push({ id: s.id, title: s.title });
  }
  return map;
}
