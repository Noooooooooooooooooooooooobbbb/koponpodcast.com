import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseXml, find, children, textOf } from '../lib/xml.mjs';
import { decodeEntities } from '../lib/entities.mjs';
import { plainText as plainTextImport, stripTags as stripTagsImport, slugify, parseDuration, formatDuration, excerpt, clock, parseDate, esc, jsonForScript, formatDateLong } from '../lib/text.mjs';
import { sanitizeHtml } from '../lib/sanitize.mjs';
import { parsePodcastFeed } from '../lib/feed.mjs';
import { parseNewsFeed, fetchAllNews, pickDiverse, dedupe } from '../lib/news.mjs';
import { decideRebuild } from '../lib/rebuild.mjs';

const fx = (p) => readFileSync(new URL(`./fixtures/${p}`, import.meta.url), 'utf8');

// ---------------------------------------------------------------- XML
test('xml: CDATA, entities, attributes, self-closing, comments, PI, doctype, BOM', () => {
  const doc = parseXml('﻿<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><!-- <c/> --><r a="1 &amp; 2" b=\'x>y\'><t><![CDATA[<p>hi & bye</p>]]></t><e/><n>A &amp; B &#8217; &#x1F534; &rsquo;</n></r>');
  const r = find(doc, 'r');
  assert.equal(r.attrs.a, '1 & 2');
  assert.equal(r.attrs.b, 'x>y');
  assert.equal(textOf(find(r, 't')), '<p>hi & bye</p>');
  assert.equal(textOf(find(r, 'n')), 'A & B ’ 🔴 ’');
  assert.equal(children(r, 'e').length, 1);
  assert.equal(find(doc, 'c'), null, 'comment content must not become an element');
});

test('xml: recovers from broken nesting and stray "<"', () => {
  const doc = parseXml('<rss><channel><item><title>a < b</title><bad><item><title>second</title></item></channel></rss>');
  const titles = [];
  const walk = (n) => { for (const c of n.children) if (typeof c === 'object') { if (c.name === 'title') titles.push(textOf(c)); walk(c); } };
  walk(doc);
  assert.deepEqual(titles, ['a < b', 'second']);
});

test('xml: truncated document does not throw', () => {
  assert.doesNotThrow(() => parseXml('<rss><channel><item><title>cut off mid'));
  assert.doesNotThrow(() => parseXml('<rss><![CDATA[never closed'));
  assert.doesNotThrow(() => parseXml(''));
  assert.doesNotThrow(() => parseXml(null));
});

test('entities: invalid code points become replacement char, unknown names kept', () => {
  assert.equal(decodeEntities('&#0;&#xD800;&bogus;&amp;'), '��&bogus;&');
});

// ---------------------------------------------------------------- text
test('slugify reproduces every existing URL on the current site', () => {
  const pairs = {
    'Rio the Hero!': 'rio-the-hero', 'Feeling better!': 'feeling-better', 'Kavanagh Ruins It!': 'kavanagh-ruins-it',
    'Liverpool vs Man City preview!!': 'liverpool-vs-man-city-preview', '114: The Facts': '114-the-facts',
    'Reasons to Believe!': 'reasons-to-believe', 'Excessive Celebrations!': 'excessive-celebrations',
    'Work In Progress!': 'work-in-progress', 'Barcola, UCL, and Forest: All Systems Go!!': 'barcola-ucl-and-forest-all-systems-go',
    'Ready! Set! Draw!': 'ready-set-draw', 'PL and Newcastle Preview!!!': 'pl-and-newcastle-preview', 'Package Deal!': 'package-deal',
    'Anfield Irishman special!': 'anfield-irishman-special', 'Trev Downey Special!': 'trev-downey-special', 'Day Zero!': 'day-zero',
    "Iraola's Interview (pt. 3), and Darwin to return?": 'iraola-s-interview-pt-3-and-darwin-to-return',
    "Iraola's Interview (pt.2), and Fare Thee Well, Divock!": 'iraola-s-interview-pt-2-and-fare-thee-well-divock',
    "Iraola's First Interview: Reaction Special! (pt 1)": 'iraola-s-first-interview-reaction-special-pt-1',
    'Iraola In!': 'iraola-in', 'Thank You, Arne!': 'thank-you-arne', 'How Sh*t Are We?': 'how-sh-t-are-we',
  };
  for (const [title, slug] of Object.entries(pairs)) assert.equal(slugify(title), slug, title);
  assert.equal(slugify('Jérémy Jacquet: a duck'), 'jeremy-jacquet-a-duck');
  assert.equal(slugify('!!!'), 'episode');
});

test('durations', () => {
  assert.equal(parseDuration('01:23:00'), 4980);
  assert.equal(parseDuration('00:34:57'), 2097);
  assert.equal(parseDuration('34:57'), 2097);
  assert.equal(parseDuration('4980'), 4980);
  assert.equal(parseDuration('garbage'), 0);
  assert.equal(formatDuration(4980), '1 h 23 min');
  assert.equal(formatDuration(2097), '35 min');
  assert.equal(formatDuration(3600), '1 h');
  assert.equal(formatDuration(20), '1 min');
  assert.equal(clock(4980), '1:23:00');
  assert.equal(clock(75), '1:15');
});

test('dates: BST and UK display', () => {
  assert.equal(parseDate('Fri, 23 Oct 2026 08:00:00 BST').toISOString(), '2026-10-23T07:00:00.000Z');
  assert.equal(parseDate('nonsense'), null);
  // 23:30 UTC on 21 Sep is already 22 Sep in London (BST)
  assert.equal(formatDateLong(new Date('2026-09-21T23:30:00Z')), '22 September 2026');
});

test('excerpt stops at boilerplate and strips invisibles', () => {
  const html = '<p>Karl Coppack (⁠buy him a coffee⁠!!) and Nigel join Owen to react to Iraola&#39;s first interview as LFC boss.</p><p>YNWA!!</p><p>KOP ON YOUTUBE: ➡️ link</p>';
  const ex = excerpt(html, 200, ['KOP ON YOUTUBE', 'YNWA!!']);
  assert.equal(ex, "Karl Coppack (buy him a coffee!!) and Nigel join Owen to react to Iraola's first interview as LFC boss.");
  assert.ok(excerpt('word '.repeat(100), 50).endsWith('…'));
});

test('escaping helpers', () => {
  assert.equal(esc(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  assert.ok(!jsonForScript({ a: '</script><script>alert(1)</script>' }).includes('</script>'));
});

// ---------------------------------------------------------------- sanitizer
test('sanitizer removes every XSS vector', () => {
  const nasty = `<p onclick="alert(1)">Hello <b>bold</b> <script>alert('x')</script>world</p>
    <img src=x onerror="alert(2)"><a href="javascript:alert(3)">bad</a><a href=" JaVaScRiPt:alert(4)">bad2</a>
    <a href="java&#x09;script:alert(7)">bad3</a><a href="data:text/html,<script>alert(8)</script>">bad4</a>
    <iframe src="https://evil.example"></iframe><style>body{display:none}</style><svg><script>alert(6)</script></svg>
    <SCRIPT>alert(9)</SCRIPT><a href="https://ok.example/?a=1&amp;b=2" onmouseover="alert(5)">good</a>
    <p style="background:url(javascript:alert(10))">styled</p><object data="x"></object><math><mi>x</mi></math>`;
  const out = sanitizeHtml(nasty);
  assert.doesNotMatch(out, /alert|javascript|onerror|onclick|onmouseover|<img|<iframe|<style|<svg|<script|<object|style=|data:/i);
  assert.match(out, /<strong>bold<\/strong>/);
  assert.match(out, /<a href="https:\/\/ok\.example\/\?a=1&amp;b=2" target="_blank" rel="nofollow noopener ugc">good<\/a>/);
  assert.match(out, /bad2?/); // text of bad links is kept, link removed
});

test('sanitizer produces balanced markup', () => {
  const out = sanitizeHtml('<ul><li>one<li>two</ul><p>unclosed <strong>tag<p>next</p></em></div>');
  const opens = (out.match(/<(p|ul|li|strong)>/g) || []).length;
  const closes = (out.match(/<\/(p|ul|li|strong)>/g) || []).length;
  assert.equal(opens, closes, out);
  assert.match(out, /<li>one<\/li><li>two<\/li>/);
});

test('sanitizer: bare URLs become links, trailing punctuation kept outside', () => {
  const out = sanitizeHtml('<p>Visit https://www.thisisanfield.com/latest. Now!</p>');
  assert.match(out, /<a href="https:\/\/www\.thisisanfield\.com\/latest" [^>]+>https:\/\/www\.thisisanfield\.com\/latest<\/a>\. Now!/);
});

test('sanitizer: chapter timestamps become seek buttons', () => {
  const out = sanitizeHtml('<p>00:00 Intro</p><p>04:12 Rio</p><p>1:02:30 Brighton preview</p><p>9:99 not a time</p>', { durationSeconds: 4980 });
  assert.match(out, /<button type="button" class="ts" data-t="0" aria-label="Play from 00:00">00:00<\/button> Intro/);
  assert.match(out, /data-t="252"/);
  assert.match(out, /data-t="3750"/);
  assert.doesNotMatch(out, /data-t="[^"]*">9:99/);
});

test('sanitizer: a lone time in prose is not linked; times past the end are not linked', () => {
  const prose = sanitizeHtml('<p>Kick-off was at 16:30, and it all went wrong.</p>', { durationSeconds: 2350 });
  assert.doesNotMatch(prose, /<button/);
  const late = sanitizeHtml('<p>00:00 Intro</p><p>12:34 Two</p><p>1:02:03 Too late</p>', { durationSeconds: 2400 });
  assert.match(late, /data-t="754"/);
  assert.doesNotMatch(late, /data-t="3723"/);
});

test('sanitizer: timestamps inside links are left alone', () => {
  const out = sanitizeHtml('<p>00:00 a</p><p><a href="https://x.example">at 12:34</a></p><p>20:00 b</p>');
  assert.match(out, /<a [^>]+>at 12:34<\/a>/);
});

// ---------------------------------------------------------------- podcast feed
test('podcast feed: realistic Anchor fixture', () => {
  const xml = fx('podcast.xml').replaceAll('{{AUDIO}}', 'https://audio.example/a.mp3');
  const { show, episodes, signature } = parsePodcastFeed(xml, { excerptStopMarkers: ['YNWA!! KOP ON YOUTUBE', 'YNWA!!'] });
  assert.equal(show.title, 'Kop On! A Liverpool FC (LFC) podcast');
  assert.equal(episodes.length, 50);
  const [latest] = episodes;
  assert.equal(latest.title, 'Rio the Hero!');
  assert.equal(latest.slug, 'rio-the-hero');
  assert.equal(latest.durationText, '1 h 23 min');
  assert.equal(latest.dateLong, '22 October 2026');
  assert.equal(latest.season, 9);
  assert.equal(latest.audio.type, 'audio/mpeg');
  assert.equal(latest.newer, null);
  assert.equal(latest.older.slug, 'feeling-better');
  assert.match(latest.notesHtml, /class="ts" data-t="252"/);
  assert.ok(!latest.excerpt.includes('KOP ON YOUTUBE'));
  assert.ok(!latest.excerpt.includes('⁠'));
  assert.equal(episodes[2].slug, 'kavanagh-ruins-it');
  assert.doesNotMatch(episodes[2].notesHtml, /<button/, 'lone "16:30" must not be a timestamp');
  assert.equal(episodes[6].dateLong, '21 September 2026', 'late-evening UTC date shown in UK time');
  assert.match(signature, /^[0-9a-f]{32}$/);
  // every slug in the current sitemap must still exist
  const sitemap = fx('old-sitemap.xml');
  const oldSlugs = [...sitemap.matchAll(/episodes\/([a-z0-9-]+)\//g)].map((m) => m[1]);
  const newSlugs = new Set(episodes.map((e) => e.slug));
  for (const s of oldSlugs) assert.ok(newSlugs.has(s), `missing old URL ${s}`);
});

test('podcast feed: hostile fixture', () => {
  const xml = fx('nasty-podcast.xml').replaceAll('{{AUDIO}}', 'https://audio.example/a.mp3');
  const { episodes } = parsePodcastFeed(xml);
  const n = episodes.find((e) => e.guid === 'nasty-1');
  assert.equal(n.title, `Quotes "double" & 'single' ‘curly’`);
  assert.equal(n.date.toISOString(), '2026-10-23T07:00:00.000Z');
  assert.doesNotMatch(n.notesHtml, /alert\(|javascript|onerror|<iframe|<svg|<style/i);
  assert.match(n.notesHtml, /data-t="754"/);
  assert.doesNotMatch(n.notesHtml, /data-t="3723"/);
  const dupNew = episodes.find((e) => e.guid === 'dup-new');
  const dupOld = episodes.find((e) => e.guid === 'dup-old');
  assert.equal(dupOld.slug, 'dup-title', 'older episode keeps the original URL');
  assert.equal(dupNew.slug, 'dup-title-2');
  const noAudio = episodes.find((e) => e.guid === 'nasty-2');
  assert.equal(noAudio.audio, null);
  assert.equal(noAudio.excerpt, 'plain & text');
});

test('podcast feed: rejects non-feeds clearly', () => {
  assert.throws(() => parsePodcastFeed('<html><body>Error 502</body></html>'), /no <channel>/);
});

// ---------------------------------------------------------------- news
test('news: WordPress, Reach and Atom formats', () => {
  const tia = parseNewsFeed(fx('news/this-is-anfield.xml'), { id: 'tia', name: 'This Is Anfield' });
  assert.equal(tia.length, 5);
  assert.equal(tia[1].title, 'Liverpool ‘make contact’ for Felix Nmecha in new midfielder search');
  assert.equal(tia[0].image, 'https://www.thisisanfield.com/wp-content/uploads/barcola.jpg');
  assert.equal(tia[2].image, null);
  assert.match(tia[0].url, /^https:\/\/www\.thisisanfield\.com\//);

  const echo = parseNewsFeed(fx('news/liverpool-echo.xml'), { id: 'echo', name: 'Liverpool Echo' });
  assert.equal(echo.length, 4);
  assert.match(echo[0].image, /^https:\/\/i2-prod\.liverpoolecho\.co\.uk\//);
  assert.equal(echo[2].title, "Why Rio Ngumoha could be Andoni Iraola's Liverpool trump card against red-hot Brighton");

  const yt = parseNewsFeed(fx('news/youtube.xml'), { id: 'yt', name: 'YT' });
  assert.equal(yt.length, 1);
  assert.equal(yt[0].url, 'https://www.youtube.com/watch?v=abc');
  assert.equal(yt[0].image, 'https://i2.ytimg.com/vi/abc/hqdefault.jpg');
  assert.equal(yt[0].date, '2026-10-21T22:05:00.000Z');

  assert.deepEqual(parseNewsFeed('<html>not a feed</html>'), []);
});

function fixtureFetch(map, calls = []) {
  return async (url, init) => {
    calls.push({ url, init });
    const v = map[url];
    if (v === 'TIMEOUT') {
      return new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(init.signal.reason)));
    }
    if (v === undefined) return new Response('nope', { status: 404 });
    if (v instanceof Error) throw v;
    return new Response(v, { status: 200, headers: { 'content-type': 'application/rss+xml' } });
  };
}

test('news: merge, dedupe, age filter, failing and slow sources isolated', async () => {
  const sources = [
    { id: 'tia', name: 'This Is Anfield', urls: ['https://a/feed'] },
    { id: 'taw', name: 'The Anfield Wrap', urls: ['https://b/feed'] },
    { id: 'ao', name: 'Anfield Online', urls: ['https://c/feed'] },
    { id: 'dead', name: 'Dead', urls: ['https://dead/feed'] },
    { id: 'slow', name: 'Slow', urls: ['https://slow/feed'] },
    { id: 'echo', name: 'Echo', urls: ['https://echo/broken', { url: 'https://echo/football', keywords: ['brighton'] }] },
  ];
  const calls = [];
  const fetch = fixtureFetch({
    'https://a/feed': fx('news/this-is-anfield.xml'),
    'https://b/feed': fx('news/the-anfield-wrap.xml'),
    'https://c/feed': fx('news/anfield-online.xml'),
    'https://dead/feed': new Error('ECONNREFUSED'),
    'https://slow/feed': 'TIMEOUT',
    'https://echo/football': fx('news/liverpool-echo.xml'),
  }, calls);
  const t0 = Date.now();
  const data = await fetchAllNews(sources, { fetch, timeoutMs: 300, now: '2026-10-23T12:00:00Z' });
  assert.ok(Date.now() - t0 < 2000, 'slow source must not hold everything up');
  const by = Object.fromEntries(data.sources.map((s) => [s.id, s]));
  assert.equal(by.tia.count, 5);
  assert.equal(by.taw.count, 5, 'per-source count is before cross-source dedupe');
  assert.equal(by.ao.count, 1, 'item older than 30 days dropped');
  assert.equal(by.dead.ok, false);
  assert.match(by.dead.errors[0], /ECONNREFUSED/);
  assert.equal(by.slow.ok, false);
  assert.match(by.slow.errors[0], /timed out/);
  assert.equal(by.echo.count, 3, 'fallback URL used and filtered by keyword');
  assert.match(by.echo.errors[0], /HTTP 404/);
  const tawTitles = data.items.filter((i) => i.sourceId === 'taw').map((i) => i.title);
  assert.equal(tawTitles.length, 3, 'duplicates and near-duplicates removed: ' + tawTitles.join(' / '));
  for (let i = 1; i < data.items.length; i++) assert.ok(Date.parse(data.items[i - 1].date) >= Date.parse(data.items[i].date), 'sorted newest first');
  assert.ok(calls.every((c) => /KopOnNews/.test(c.init.headers['User-Agent'])));
});

test('news: pickDiverse caps each source', () => {
  const items = [];
  for (let i = 0; i < 10; i++) items.push({ title: 'e' + i, url: 'u' + i, sourceId: 'echo', date: new Date(Date.UTC(2026, 9, 23, 12 - i)).toISOString() });
  items.push({ title: 'x', url: 'ux', sourceId: 'tia', date: new Date(Date.UTC(2026, 9, 22)).toISOString() });
  const picked = pickDiverse(items, 5, 2);
  assert.equal(picked.length, 5);
  assert.equal(picked.filter((p) => p.sourceId === 'tia').length, 1);
  assert.equal(pickDiverse(items.slice(0, 3), 5, 2).length, 3);
  assert.equal(dedupe([{ title: 'A b!', url: 'https://x/1' }, { title: 'a B', url: 'https://x/2' }]).length, 1);
});

// ---------------------------------------------------------------- rebuild
test('rebuild decisions', () => {
  const now = new Date('2026-10-23T12:05:00Z'); // 12:05 UTC = inside a 3-hourly slot
  const off = new Date('2026-10-23T13:05:00Z'); // outside the slot
  const feed = { count: 50, signature: 'abc', latestGuid: 'g2', latestTitle: 'New one', latestDate: '2026-10-23T12:40:00Z' };
  const fresh = { signature: 'abc', latestGuid: 'g2', builtAt: '2026-10-23T08:00:00Z' };
  assert.equal(decideRebuild(fresh, feed, { now }).rebuild, false);
  // brand-new episode: immediate, even outside the slot
  const newEp = decideRebuild({ signature: 'old', latestGuid: 'g1', builtAt: '2026-10-23T08:00:00Z' }, feed, { now: off });
  assert.equal(newEp.rebuild, true);
  assert.match(newEp.reason, /New episode: New one/);
  // same "new" episode 2 hours later and the site still hasn't caught up: throttled
  const later = new Date('2026-10-23T14:40:00Z');
  assert.equal(decideRebuild({ signature: 'old', latestGuid: 'g1', builtAt: '2026-10-23T08:00:00Z' }, feed, { now: later }).rebuild, false);
  assert.equal(decideRebuild({ signature: 'old', latestGuid: 'g1', builtAt: '2026-10-23T08:00:00Z' }, feed, { now: new Date('2026-10-23T15:10:00Z') }).rebuild, true);
  // edits: only in the slot
  assert.equal(decideRebuild({ signature: 'old', latestGuid: 'g2', builtAt: '2026-10-23T08:00:00Z' }, feed, { now }).rebuild, true);
  // a future-dated episode must not count as "new" forever (would loop every 15 min)
  const future = { ...feed, latestDate: '2026-12-25T00:00:00Z' };
  assert.equal(decideRebuild({ signature: 'old', latestGuid: 'g1', builtAt: '2026-10-23T08:00:00Z' }, future, { now: off }).rebuild, false);
  assert.equal(decideRebuild({ signature: 'old', latestGuid: 'g2', builtAt: '2026-10-23T08:00:00Z' }, feed, { now: off }).rebuild, false);
  // daily refresh
  assert.match(decideRebuild({ ...fresh, builtAt: '2026-10-21T08:00:00Z' }, feed, { now }).reason, /Daily refresh/);
  assert.equal(decideRebuild({ ...fresh, builtAt: '2026-10-21T08:00:00Z' }, feed, { now: off }).rebuild, false);
  assert.equal(decideRebuild({ ...fresh, builtAt: '2026-10-21T08:00:00Z' }, feed, { now, maxAgeHours: 0 }).rebuild, false);
  // missing status / empty feed
  assert.equal(decideRebuild(null, feed, { now }).rebuild, true);
  assert.equal(decideRebuild(null, feed, { now: off }).rebuild, false);
  assert.equal(decideRebuild({ signature: 'x' }, { count: 0 }, { now }).rebuild, false, 'empty feed (outage) never triggers a build');
  // worst cases with builds always failing, a check every 15 minutes for 24 h
  const simulate = (latestDate) => {
    let builds = 0;
    for (let m = 0; m < 24 * 60; m += 15) {
      const t = new Date(Date.UTC(2026, 9, 24, 0, m));
      if (decideRebuild({ signature: 'old', latestGuid: 'g1', builtAt: '2026-10-20T00:00:00Z' }, { ...feed, latestDate }, { now: t }).rebuild) builds++;
    }
    return builds;
  };
  assert.equal(simulate('2026-10-23T11:30:00Z'), 8, 'old episode, stuck: 8 a day');
  assert.ok(simulate('2026-10-24T10:20:00Z') <= 11, 'new episode that day, stuck: at most 11');
  assert.equal(simulate('2027-01-01T00:00:00Z'), 8, 'future-dated episode, stuck: 8 a day');
  // daily refresh happens about every 24 h, not 27
  let last = Date.parse('2026-10-24T00:05:00Z'), gaps = [];
  for (let m = 15; m < 4 * 24 * 60; m += 15) {
    const t = new Date(Date.parse('2026-10-24T00:05:00Z') + m * 60000);
    if (decideRebuild({ ...fresh, builtAt: new Date(last).toISOString() }, feed, { now: t }).rebuild) { gaps.push((t - last) / 3600000); last = t.getTime(); }
  }
  assert.ok(gaps.every((g) => g >= 21 && g <= 24), 'refresh gaps ' + gaps.join(','));
});

test('scheduled check end to end (mocked network)', async () => {
  const { runScheduledCheck } = await import('../lib/rebuild.mjs');
  const xml = fx('podcast.xml').replaceAll('{{AUDIO}}', 'https://audio.example/a.mp3');
  const parsed = parsePodcastFeed(xml);
  const calls = [];
  const mk = (status) => async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET' });
    if (url.startsWith('https://feed')) return new Response(xml);
    if (url.includes('site-status.json')) return status === 404 ? new Response('no', { status: 404 }) : status === 500 ? new Response('x', { status: 500 }) : new Response(JSON.stringify(status));
    if (url.startsWith('https://api.netlify.com/build_hooks/abc')) return new Response('', { status: 200 });
    throw new Error('unexpected ' + url);
  };
  const base = { feedUrl: 'https://feed/rss', siteUrl: 'https://site.example/', hookUrl: 'https://api.netlify.com/build_hooks/abc', parseFeed: (x) => parsePodcastFeed(x), log: () => {} };
  const now = new Date('2026-10-23T12:05:00Z');

  let r = await runScheduledCheck({ ...base, fetchImpl: mk({ signature: parsed.signature, latestGuid: parsed.episodes[0].guid, builtAt: '2026-10-23T11:00:00Z' }), now });
  assert.equal(r.rebuild, false);
  assert.equal(calls.filter((c) => c.method === 'POST').length, 0);
  assert.ok(calls.some((c) => c.url === 'https://site.example/site-status.json?t=' + now.getTime()), 'trailing slash handled');

  calls.length = 0;
  // the fixture's latest episode is dated 22 Oct 09:03 UTC; check 20 minutes later
  r = await runScheduledCheck({ ...base, fetchImpl: mk({ signature: 'old', latestGuid: 'other', builtAt: '2026-10-21T11:00:00Z' }), now: new Date('2026-10-22T09:23:00Z') });
  assert.equal(r.rebuild, true);
  assert.equal(r.triggered, true);
  const post = calls.find((c) => c.method === 'POST');
  assert.match(post.url, /^https:\/\/api\.netlify\.com\/build_hooks\/abc\?trigger_title=New%20episode/);

  calls.length = 0;
  r = await runScheduledCheck({ ...base, fetchImpl: mk(500), now });
  assert.equal(r.rebuild, false, 'server error on status file: do not guess');
  r = await runScheduledCheck({ ...base, fetchImpl: mk(404), now });
  assert.equal(r.rebuild, true, '404 status file (first deploy) inside slot: build');

  r = await runScheduledCheck({ ...base, hookUrl: '', fetchImpl: mk(404), now });
  assert.equal(r.rebuild, false);
  const failingFeed = async (url) => { if (url.startsWith('https://feed')) return new Response('<html>502</html>', { status: 502 }); throw new Error('nope'); };
  r = await runScheduledCheck({ ...base, fetchImpl: failingFeed, now });
  assert.equal(r.reason, 'Feed unavailable');
});

// ---------------------------------------------------------------- review regressions
test('review: linkify stops at quotes and brackets, keeps balanced parentheses', () => {
  const a = sanitizeHtml('<p>Watch "https://youtu.be/abc" now</p>');
  assert.match(a, /href="https:\/\/youtu\.be\/abc"/);
  const b = sanitizeHtml('<p>&lt;https://x.com/path&gt;</p>');
  assert.match(b, /href="https:\/\/x\.com\/path"/);
  const c = sanitizeHtml('<p>See https://en.wikipedia.org/wiki/Anfield_(stadium).</p>');
  assert.match(c, /href="https:\/\/en\.wikipedia\.org\/wiki\/Anfield_\(stadium\)"/);
  const d = sanitizeHtml('<p>(more at https://example.com/x)</p>');
  assert.match(d, /href="https:\/\/example\.com\/x"[^>]*>https:\/\/example\.com\/x<\/a>\)/);
});

test('review: href hidden inside another attribute is ignored', () => {
  const out = sanitizeHtml('<a title=" href=https://evil.com " href="https://good.com">x</a>');
  assert.match(out, /href="https:\/\/good\.com"/);
  assert.doesNotMatch(out, /evil/);
});

test('review: slugs for letters that do not decompose', () => {
  assert.equal(slugify('Ødegaard'), 'odegaard');
  assert.equal(slugify('Straße'), 'strasse');
  assert.equal(slugify('Mané’s magic'), 'mane-s-magic');
});

test('review: hostile input stays fast and never overflows the stack', () => {
  const t0 = Date.now();
  plainTextImport('<script'.repeat(60000));
  stripTagsImport('<script'.repeat(60000) + '<style'.repeat(60000));
  assert.ok(Date.now() - t0 < 1500, `took ${Date.now() - t0} ms`);
  const deep = '<rss><channel><item><title>t</title><description>' + '<b>'.repeat(20000) + 'x</description></item></channel></rss>';
  assert.doesNotThrow(() => parsePodcastFeed(deep));
});

test('review: episodes without audio get no dead timestamp buttons', () => {
  const xml = '<rss><channel><item><title>No audio</title><guid>n</guid><description>&lt;p&gt;00:00 a&lt;/p&gt;&lt;p&gt;05:00 b&lt;/p&gt;</description></item></channel></rss>';
  assert.doesNotMatch(parsePodcastFeed(xml).episodes[0].notesHtml, /<button/);
});

// ---------------------------------------------------------------- YouTube Shorts
test('shorts: feed URL, video IDs from any link, feed parsing', async () => {
  const { shortsFeedUrl, videoId, parseShortsFeed } = await import('../lib/shorts.mjs');
  assert.equal(shortsFeedUrl('UC0dlhg-sM8HAbWvCcOiB0AQ'), 'https://www.youtube.com/feeds/videos.xml?playlist_id=UUSH0dlhg-sM8HAbWvCcOiB0AQ');
  assert.equal(shortsFeedUrl('nonsense'), '');
  for (const link of ['https://youtube.com/shorts/RioClip0001?feature=share', 'https://www.youtube.com/watch?v=RioClip0001&t=4', 'https://youtu.be/RioClip0001', 'RioClip0001', 'https://www.youtube-nocookie.com/embed/RioClip0001']) {
    assert.equal(videoId(link), 'RioClip0001', link);
  }
  assert.equal(videoId('https://example.com/RioClip0001'), '');
  assert.equal(videoId('"><script>'), '');
  const list = parseShortsFeed(fx('youtube-shorts.xml'));
  assert.deepEqual(list.map((s) => s.id), ['RioClip0001', 'RioTeaser01', 'LaskClip001']);
  assert.equal(list[0].title, "Rio Ngumoha is DIFFERENT & here's why");
  assert.deepEqual(parseShortsFeed('<html>blocked</html>'), []);
});

test('shorts: matched to the right episode, extras, hidden, caps, memory', async () => {
  const { parseShortsFeed, assignShorts, mergeShorts } = await import('../lib/shorts.mjs');
  const { episodes } = parsePodcastFeed(fx('podcast.xml').replaceAll('{{AUDIO}}', 'https://a.example/x.mp3'));
  const shorts = parseShortsFeed(fx('youtube-shorts.xml'));
  let map = assignShorts(episodes, shorts);
  assert.deepEqual(map.get('rio-the-hero').map((s) => s.id), ['RioTeaser01', 'RioClip0001'], 'teaser posted an hour before release goes with the new episode');
  assert.deepEqual(map.get('feeling-better').map((s) => s.id), ['LaskClip001']);
  assert.equal(map.get('kavanagh-ruins-it').length, 0);
  map = assignShorts(episodes, shorts, { extra: { 'Kavanagh Ruins It!': ['https://youtube.com/shorts/LaskClip001'], 'no-such-episode': ['RioClip0001'] }, hide: ['https://youtu.be/RioTeaser01'] });
  assert.deepEqual(map.get('kavanagh-ruins-it').map((s) => s.id), ['LaskClip001'], 'manual placement wins');
  assert.deepEqual(map.get('feeling-better').map((s) => s.id), []);
  assert.deepEqual(map.get('rio-the-hero').map((s) => s.id), ['RioClip0001'], 'hidden Short removed');
  map = assignShorts(episodes, shorts, { perEpisode: 1 });
  assert.equal(map.get('rio-the-hero').length, 1);
  const merged = mergeShorts([{ id: 'OldClip0001', title: 'old', published: '2026-09-01T00:00:00Z' }, { id: 'bad', published: 'x' }], shorts);
  assert.deepEqual(merged.map((s) => s.id), ['RioClip0001', 'RioTeaser01', 'LaskClip001', 'OldClip0001'], 'Shorts that dropped off the feed are remembered');
});

test('shorts: the checker rebuilds for new Shorts (throttled)', () => {
  const now = new Date('2026-10-24T12:05:00Z'), off = new Date('2026-10-24T13:05:00Z');
  const feed = { count: 50, signature: 's', latestGuid: 'g', shortsIds: ['B', 'A'] };
  const live = { signature: 's', latestGuid: 'g', builtAt: '2026-10-24T11:00:00Z', shortsFeedIds: ['A'] };
  assert.match(decideRebuild(live, feed, { now }).reason, /New YouTube Shorts/);
  assert.equal(decideRebuild(live, feed, { now: off }).rebuild, false);
  assert.equal(decideRebuild({ ...live, shortsFeedIds: ['B', 'A'] }, feed, { now }).rebuild, false);
  assert.equal(decideRebuild({ ...live, shortsFeedIds: null }, feed, { now }).rebuild, false, 'unknown on the live site: wait for the daily refresh');
  assert.equal(decideRebuild(live, { ...feed, shortsIds: undefined }, { now }).rebuild, false, 'YouTube unreachable: no rebuild');
});

test('links to other sites open in a new tab; own links do not', async () => {
  const { externalLinksInNewTab } = await import('../src/templates.mjs');
  const html = '<a href="/episodes/">a</a><a href="https://koponpodcast.com/news/">b</a><a href="https://www.koponpodcast.com/x">c</a><a class="btn" href="https://open.spotify.com/x" rel="me">d</a><a href="https://x.com" target="_self">e</a><a href="#listen">f</a><a href="https://y.com" rel="nofollow noopener ugc" target="_blank">g</a>';
  const out = externalLinksInNewTab(html, 'https://koponpodcast.com');
  assert.match(out, /<a href="\/episodes\/">a<\/a>/);
  assert.match(out, /<a href="https:\/\/koponpodcast\.com\/news\/">b<\/a>/);
  assert.match(out, /<a href="https:\/\/www\.koponpodcast\.com\/x">c<\/a>/);
  assert.match(out, /<a class="btn" href="https:\/\/open\.spotify\.com\/x" rel="noopener me" target="_blank">d<\/a>/);
  assert.match(out, /<a href="https:\/\/x\.com" target="_self" rel="noopener">e<\/a>/, 'an explicit target is respected');
  assert.match(out, /<a href="#listen">f<\/a>/);
  assert.equal((out.match(/target="_blank"/g) || []).length, 2);
});

// ---------------------------------------------------------------- top stories
test('clickbait: the real headlines from the old WordPress page', async () => {
  const { isClickbait, isNonStory } = await import('../lib/topstories.mjs');
  const bait = [
    'Ian Rush imparts 5-word advice to ‘fantastic’ Bradley Barcola after £106m Liverpool move',
    'Liverpool scouts watched £50m wizard score in midweek; his club signed him over Bruno Fernandes',
    'Chris Sutton gives Liverpool v Brighton prediction as he backs 6-month sequence to continue',
    '‘Definitely interested’ – Liverpool considered ‘front-runners’ to sign wantaway £100m powerhouse',
    '‘If he continues like this…’ – Spanish media deliver emphatic verdict on Ifeanyi Ndukwe',
    '‘To this day…’ – Jurgen Klopp makes heartbreaking confession over Diogo Jota’s death',
    'Liverpool fan favourite has quietly amassed eye-catching statistic bettered only by Lamine Yamal',
    'Liverpool fans rush to get 50% off 26/27 home shirt before flash sale ends Friday',
    'Jurgen Klopp makes Harry Kane feelings clear as ex-Liverpool boss reignites feud',
    'Sky reporter explains why Bradley Barcola didn’t train with Liverpool squad on Thursday',
  ];
  const news = [
    'Liverpool schedule meeting with agents to discuss potential cancellation of loan deal',
    'Bradley Barcola declared fit vs. Brighton as Victor Munoz doubt explained',
    'Liverpool ‘make contact’ for Felix Nmecha in new midfielder search',
    'Harvey Elliott challenged to ‘step up’ after Liverpool and Valencia talks',
    'Dominik Szoboszlai return timeline revealed after hamstring injury',
    'Diogo Jota biography released by Liverpool – with proceeds to fitting cause',
    'Liverpool attend Harvey Elliott meeting as Valencia in agreement over winger',
    'Referee who made confirmed Liverpool error picked for Reds vs Brighton clash',
    'Liverpool complete signing of French forward Bradley Barcola',
    'Everton 1-2 Liverpool: Reds win first Merseyside derby at Everton’s new stadium',
  ];
  for (const t of bait) assert.ok(isClickbait(t), 'should be clickbait: ' + t);
  for (const t of news) assert.ok(!isClickbait(t), 'should be news: ' + t);
  assert.ok(isNonStory('Liverpool 4 Villarreal 3 | Post Match Pint'));
  assert.ok(isNonStory('Andoni Iraola Liverpool press conference LIVE - Barcola, Szoboszlai'));
  assert.ok(!isNonStory('Barcola passed fit for Liverpool'));
  assert.ok(isClickbait('Liverpool transfer gossip roundup', ['transfer gossip']), 'Owen can add his own clickbait words');
});

test('top stories: groups the same story, ranks by coverage, factual headline and real summary', async () => {
  const cfg = (await import('../site.config.mjs')).default;
  const { newsOptions } = await import('../lib/news.mjs');
  const map = {};
  for (const s of cfg.news.sources) map[typeof s.urls[0] === 'string' ? s.urls[0] : s.urls[0].url] = `news/${s.id}.xml`;
  const fetch = async (u) => { try { return new Response(fx(map[u])); } catch { return new Response('x', { status: 404 }); } };
  const d = await fetchAllNews(cfg.news.sources, newsOptions(cfg, { fetch, now: '2026-10-23T12:00:00Z', includeCandidates: true }));
  assert.equal(d.top.length, 5);
  const [a, b, c] = d.top;
  assert.equal(a.headline, "Barcola passed fit for Liverpool's game against Brighton", 'BBC is trusted most');
  assert.equal(a.count, 4);
  assert.deepEqual(a.sources.map((s) => s.name).sort(), ['BBC Sport', 'Liverpool Echo', 'The Guardian', 'This Is Anfield']);
  assert.match(a.summary, /^Liverpool forward Bradley Barcola is fit to face Brighton on Saturday/);
  assert.match(b.headline, /Elliott/); assert.equal(b.count, 3);
  assert.match(c.headline, /Storm Amy/); assert.equal(c.count, 2, 'storm story from two sites merged via their summaries');
  assert.ok(!d.top.some((s) => /Ian Rush|signing of French/.test(s.headline)));
  const fit = d.candidates.find((s) => /Barcola passed fit/.test(s.headline));
  assert.ok(!fit.urls.some((u) => /anfield-online|empireofthekop/.test(u)), 'the old "Barcola signs" story and Ian Rush clickbait are not glued to "Barcola fit"');
  // clickbait never reaches the news lists
  assert.ok(!d.items.some((i) => /imparts 5-word|heartbreaking confession|50% off/.test(i.title)));
  assert.ok(d.items.every((i) => !('summary' in i)), 'summaries stay out of the list (smaller page)');
  // HTML from feeds can't sneak into summaries
  assert.ok(d.top.every((s) => !/[<>]/.test(s.summary)));
});

test('top stories: Owen\'s edits (rewrite, hide, pin, expiry)', async () => {
  const { applyTopEdits } = await import('../lib/topstories.mjs');
  const now = new Date('2026-10-23T12:00:00Z');
  const auto = ['a', 'b', 'c', 'd', 'e', 'f'].map((k, i) => ({ key: `site.com/${k}`, urls: [`site.com/${k}`, `other.com/${k}`], headline: `Auto ${k}`, summary: `S ${k}`, sources: [], count: 2, date: now.toISOString(), score: 10 - i }));
  const out = applyTopEdits(auto, {
    pinned: [{ id: 'x1', headline: 'Owen’s story', summary: 'Mine', url: 'javascript:alert(1)', until: '2026-10-25T00:00:00Z' }, { id: 'old', headline: 'Expired', until: '2026-10-20T00:00:00Z' }],
    hidden: ['https://other.com/b?utm=1'],
    changes: { 'site.com/c': { headline: 'Better headline', summary: '' } },
  }, { now });
  assert.deepEqual(out.map((s) => s.headline), ['Owen’s story', 'Auto a', 'Better headline', 'Auto d', 'Auto e']);
  assert.equal(out[0].pinned, true);
  assert.equal(out[0].url, '', 'unsafe link dropped');
  assert.equal(out[2].summary, 'S c', 'blank summary edit keeps the original');
  assert.ok(out.every((s) => !('urls' in s) && !('score' in s)));
});

test('editor: password, GitHub save/load, validation', async () => {
  const { handleEditor, cleanEdits, parseEditsFile, serialiseEdits, passwordOk } = await import('../lib/editor.mjs');
  assert.equal(passwordOk('short', 'short'), false, 'passwords under 8 characters never work');
  assert.equal(passwordOk('correct horse', 'correct horse'), true);
  assert.equal(passwordOk('wrong', 'correct horse'), false);
  const text = serialiseEdits({ pinned: [], hidden: ['a'], changes: {} });
  assert.deepEqual(parseEditsFile(text).hidden, ['a']);
  const mod = await import('data:text/javascript,' + encodeURIComponent(text));
  assert.deepEqual(mod.default.hidden, ['a'], 'the saved file is a valid module the site can import');

  const files = new Map();
  let shaN = 0;
  const gh = async (url, init = {}) => {
    assert.match(url, /^https:\/\/api\.github\.com\/repos\/owen\/kopon\/contents\/kopon-site\/content\/top-stories\.mjs/);
    assert.equal(init.headers.Authorization, 'Bearer tok');
    if (!init.method || init.method === 'GET') {
      const f = files.get('f');
      return f ? new Response(JSON.stringify({ content: Buffer.from(f.text).toString('base64'), sha: f.sha })) : new Response('{}', { status: 404 });
    }
    const body = JSON.parse(init.body);
    const cur = files.get('f');
    if (cur && body.sha !== cur.sha) return new Response('{}', { status: 409 });
    const sha = 'sha' + (++shaN);
    files.set('f', { text: Buffer.from(body.content, 'base64').toString('utf8'), sha });
    return new Response(JSON.stringify({ content: { sha } }));
  };
  const env = { EDITOR_PASSWORD: 'correct horse', GITHUB_TOKEN: 'tok', GITHUB_REPO: 'owen/kopon' };
  const loadNews = async (edits) => ({ candidates: [{ key: 'k1', headline: 'H' }], top: [], updated: 'now', edits });
  const post = (body) => new Request('https://x/api/editor', { method: 'POST', body: JSON.stringify(body) });
  const deps = { env, fetchImpl: gh, loadNews, delay: async () => {}, now: new Date('2026-10-23T12:00:00Z') };

  let r = await handleEditor(post({ action: 'load', password: 'nope' }), deps);
  assert.equal(r.status, 401);
  r = await handleEditor(new Request('https://x/api/editor'), deps);
  assert.equal(r.status, 405);
  r = await handleEditor(post({ action: 'load', password: 'correct horse' }), { ...deps, env: { EDITOR_PASSWORD: 'correct horse' } });
  assert.equal(r.status, 503, 'clear message when GitHub saving is not set up');
  r = await handleEditor(post({ action: 'load', password: 'x' }), { ...deps, env: {} });
  assert.equal(r.status, 503);

  r = await handleEditor(post({ action: 'load', password: 'correct horse' }), deps);
  let j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.sha, null); assert.equal(j.candidates[0].key, 'k1');

  r = await handleEditor(post({ action: 'save', password: 'correct horse', sha: null, edits: { pinned: [{ headline: '<b>Big</b> news', summary: 'x'.repeat(5000), url: 'javascript:alert(1)', days: 2 }], hidden: ['k9'], changes: { k1: { headline: 'New H' } }, evil: 1 } }), deps);
  j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.sha, 'sha1');
  const saved = parseEditsFile(files.get('f').text);
  assert.equal(saved.pinned[0].headline, '<b>Big</b> news', 'stored as text; the site escapes it when showing it');
  assert.equal(saved.pinned[0].summary.length, 600);
  assert.equal(saved.pinned[0].url, '');
  assert.equal(saved.pinned[0].until, '2026-10-25T12:00:00.000Z');
  assert.deepEqual(saved.hidden, ['k9']);
  assert.ok(!('evil' in saved));

  r = await handleEditor(post({ action: 'save', password: 'correct horse', sha: 'stale', edits: {} }), deps);
  assert.equal(r.status, 409, 'two people saving at once: the second is told to reload');
  r = await handleEditor(post({ action: 'load', password: 'correct horse' }), deps);
  j = await r.json();
  assert.equal(j.sha, 'sha1'); assert.equal(j.edits.changes.k1.headline, 'New H');
  assert.deepEqual(cleanEdits({ pinned: [{ headline: 'old', until: '2020-01-01' }] }).pinned, [], 'expired stories are tidied away');
});
