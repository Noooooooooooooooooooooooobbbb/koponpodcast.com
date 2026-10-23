// Parses the podcast RSS feed (Anchor / Spotify for Creators format) into episodes.
import { createHash } from 'node:crypto';
import { parseXml, child, children, find, textOf, htmlOf, textChild } from './xml.mjs';
import { sanitizeHtml } from './sanitize.mjs';
import {
  slugify, parseDuration, formatDuration, parseDate, formatDateLong, formatDateShort, formatMonthYear,
  isoDate, excerpt, plainText, safeUrl,
} from './text.mjs';

export function parsePodcastFeed(xml, opts = {}) {
  const doc = parseXml(xml);
  const channel = find(doc, 'channel');
  if (!channel) throw new Error('Not a podcast RSS feed: no <channel> element found');

  const show = {
    title: plainText(textChild(channel, 'title')),
    description: plainText(textChild(channel, 'description', 'itunes:summary')),
    link: safeUrl(textChild(channel, 'link')),
    author: plainText(textChild(channel, 'itunes:author', 'dc:creator')),
    image: safeUrl(child(channel, 'itunes:image')?.attrs.href || textChild(child(channel, 'image'), 'url')),
  };

  const items = children(channel, 'item');
  const raw = items.map((item) => {
    const title = plainText(textChild(item, 'title'));
    const enclosure = child(item, 'enclosure');
    const audioUrl = safeUrl(enclosure?.attrs.url);
    const guid = textChild(item, 'guid') || audioUrl || textChild(item, 'link') || title;
    const date = parseDate(textChild(item, 'pubDate', 'dc:date', 'published'));
    const durationSeconds = parseDuration(textChild(item, 'itunes:duration'));
    const descNode = child(item, 'content:encoded') || child(item, 'description') || child(item, 'itunes:summary');
    const descriptionHtml = htmlOf(descNode).trim();
    return {
      guid, title, date, durationSeconds, descriptionHtml,
      audio: audioUrl ? { url: audioUrl, type: enclosure.attrs.type || 'audio/mpeg', length: +enclosure.attrs.length || 0 } : null,
      image: safeUrl(child(item, 'itunes:image')?.attrs.href) || show.image,
      link: safeUrl(textChild(item, 'link')),
      season: parseInt(textChild(item, 'itunes:season'), 10) || null,
      number: parseInt(textChild(item, 'itunes:episode'), 10) || null,
      episodeType: textChild(item, 'itunes:episodeType') || 'full',
    };
  }).filter((e) => e.title || e.audio);

  // Oldest first while assigning slugs, so an older episode keeps its URL
  // if a newer one ends up with the same title.
  const byAge = [...raw].sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));
  const used = new Set();
  const overrides = opts.slugOverrides || {};
  for (const ep of byAge) {
    let slug = overrides[ep.guid] || overrides[ep.title] || slugify(ep.title);
    if (used.has(slug)) {
      let n = 2;
      while (used.has(`${slug}-${n}`)) n++;
      slug = `${slug}-${n}`;
    }
    used.add(slug);
    ep.slug = slug;
  }

  const stop = opts.excerptStopMarkers || [];
  const episodes = byAge.reverse().map((ep, i, all) => {
    const date = ep.date || new Date(0);
    return {
      ...ep,
      date,
      dateIso: isoDate(date),
      dateTime: date.toISOString(),
      dateLong: formatDateLong(date),
      dateShort: formatDateShort(date),
      monthYear: formatMonthYear(date),
      durationText: formatDuration(ep.durationSeconds),
      excerpt: excerpt(ep.descriptionHtml, opts.excerptLength || 200, stop),
      notesHtml: sanitizeHtml(ep.descriptionHtml, { durationSeconds: ep.durationSeconds, timestamps: !!ep.audio }),
      newer: i > 0 ? all[i - 1].slug : null,
      older: i < all.length - 1 ? all[i + 1].slug : null,
    };
  });

  // Point newer/older at the episode objects for convenience
  const bySlug = new Map(episodes.map((e) => [e.slug, e]));
  for (const e of episodes) {
    e.newer = e.newer ? bySlug.get(e.newer) : null;
    e.older = e.older ? bySlug.get(e.older) : null;
  }

  return { show, episodes, signature: feedSignature(raw) };
}

// A fingerprint of everything that appears on the site; if it changes, rebuild.
export function feedSignature(items) {
  const h = createHash('sha256');
  for (const e of items) {
    h.update([e.guid, e.title, e.date ? e.date.toISOString() : '', e.durationSeconds, e.audio?.url || '', e.descriptionHtml].join('\u0001'));
    h.update('\u0002');
  }
  return h.digest('hex').slice(0, 32);
}
