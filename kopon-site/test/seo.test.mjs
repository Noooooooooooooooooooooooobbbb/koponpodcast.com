// Episode artwork and search-engine features
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { artSrc, artAttrs, episodeArt } from '../lib/art.mjs';
import { metaDescription, breadcrumbLd } from '../src/templates.mjs';
import { changedUrls, sitemapUrls, submitIndexNow, indexNowForLiveBuild, INDEXNOW_KEY } from '../lib/indexnow.mjs';
import { runScheduledCheck } from '../lib/rebuild.mjs';
import { fileStore } from '../lib/fans/store.mjs';
import config from '../site.config.mjs';

const EP_IMG = 'https://d3t3ozftmdmh3i.cloudfront.net/staging/podcast_uploaded_episode/808460/808460-1793058778179-eb35237c410a3.jpg';

test('artwork: resized through Netlify Image CDN, only for the podcast image host', () => {
  const u = new URL(artSrc(EP_IMG, 340), 'https://koponpodcast.com');
  assert.equal(u.pathname, '/.netlify/images');
  assert.equal(u.searchParams.get('url'), EP_IMG);
  assert.deepEqual([u.searchParams.get('w'), u.searchParams.get('h'), u.searchParams.get('fit')], ['340', '340', 'cover']);
  assert.equal(artSrc('https://example.com/x.jpg', 340), 'https://example.com/x.jpg', 'other hosts untouched (not allowed by netlify.toml)');
  assert.equal(artSrc('', 340), '');
  const a = artAttrs(EP_IMG, 64);
  assert.match(a.src, /w=128/); assert.match(a.srcset, /w=64&h=64&fit=cover&q=80 1x, .*w=128.* 2x/);
  assert.equal(episodeArt({ image: 'show.jpg' }, { image: 'show.jpg' }), '', 'the show logo is not "episode artwork"');
  assert.equal(episodeArt({ image: EP_IMG }, { image: 'show.jpg' }), EP_IMG);
});

test('netlify.toml allows exactly that image host, and sends the netlify.app address to koponpodcast.com', async () => {
  const toml = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
  const m = toml.match(/remote_images = \['([^']+)'\]/);
  assert.ok(m, 'remote_images set');
  const re = new RegExp(`^${m[1]}$`);
  assert.ok(re.test(EP_IMG) && !re.test('https://d3t3ozftmdmh3iXcloudfront.net/a.jpg') && !re.test('https://evil.com/?https://d3t3ozftmdmh3i.cloudfront.net/x'));
  assert.match(toml, /from = "https:\/\/koponpodcast-220d25\.netlify\.app\/\*"\s+to = "https:\/\/koponpodcast\.com\/:splat"\s+status = 301\s+force = true/);
});

test('meta descriptions end on a whole word under 155 characters', () => {
  const long = 'An inspired Rio Ngumoha led an extraordinary comeback at Anfield, as Liverpool overcame a 2-0 deficit to win 4-3 against Villareal in the Champions League. The results makes it 3 wins from 3.';
  const d = metaDescription(long);
  assert.ok(d.length <= 155 && d.endsWith('…') && !/\s…$/.test(d), d);
  assert.ok(long.startsWith(d.slice(0, -1)));
  assert.equal(metaDescription('Short one.'), 'Short one.');
  assert.equal(metaDescription('  spaced \n  out  '), 'spaced out');
});

test('breadcrumbs follow the page address', () => {
  const b = breadcrumbLd(config, '/episodes/ron-the-rattler/', 'Ron the Rattler!');
  assert.deepEqual(b.itemListElement.map((i) => [i.position, i.name, i.item]), [[1, 'Home', 'https://koponpodcast.com/'], [2, 'Episodes', 'https://koponpodcast.com/episodes/'], [3, 'Ron the Rattler!', 'https://koponpodcast.com/episodes/ron-the-rattler/']]);
  const r = breadcrumbLd(config, '/fans/ratings/2026-10-21-villarreal/', 'Liverpool 4–3 Villarreal');
  assert.deepEqual(r.itemListElement.map((i) => i.name), ['Home', 'Fan zone', 'Liverpool 4–3 Villarreal'], 'sections without a page of their own are skipped');
  assert.equal(breadcrumbLd(config, '/', 'x'), null);
});

test('IndexNow: changed pages, sitemap parsing, request shape', async () => {
  const live = { slugs: { a: 'old-one' } };
  const urls = changedUrls({ siteUrl: 'https://koponpodcast.com', live, episodes: [{ slug: 'new-one' }, { slug: 'old-one' }], everyBuild: ['/', '/stats/'] });
  assert.deepEqual(urls, ['https://koponpodcast.com/', 'https://koponpodcast.com/stats/', 'https://koponpodcast.com/episodes/new-one/']);
  assert.deepEqual(sitemapUrls('<url><loc>https://koponpodcast.com/</loc><image:image><image:loc>https://x/a.jpg</image:loc></image:image></url><url><loc>https://koponpodcast.com/a?b=1&amp;c=2</loc></url>'), ['https://koponpodcast.com/', 'https://koponpodcast.com/a?b=1&c=2']);
  let sent;
  const r = await submitIndexNow({ siteUrl: 'https://koponpodcast.com', urls: ['https://koponpodcast.com/', 'https://koponpodcast.com/', 'https://evil.com/x'], fetchImpl: async (u, init) => { sent = { u, init, body: JSON.parse(init.body) }; return new Response('', { status: 202 }); } });
  assert.equal(sent.u, 'https://api.indexnow.org/indexnow');
  assert.equal(sent.init.method, 'POST');
  assert.deepEqual(sent.body, { host: 'koponpodcast.com', key: INDEXNOW_KEY, keyLocation: `https://koponpodcast.com/${INDEXNOW_KEY}.txt`, urlList: ['https://koponpodcast.com/'] }, 'other sites and repeats dropped');
  assert.deepEqual(r, { ok: true, sent: 1, status: 202 });
  const keyFile = await readFile(new URL(`../src/static/${INDEXNOW_KEY}.txt`, import.meta.url), 'utf8');
  assert.equal(keyFile.trim(), INDEXNOW_KEY, 'the key file on the site matches');
});

test('IndexNow: once per live build; whole sitemap the first time; retries after a busy answer', async () => {
  const store = fileStore(await mkdtemp(join(tmpdir(), 'seo-')), 'kopon-seo');
  const posts = [];
  let answer = 200;
  const fetchImpl = async (u, init = {}) => {
    if (String(u).endsWith('/sitemap.xml')) return new Response('<url><loc>https://koponpodcast.com/</loc></url><url><loc>https://koponpodcast.com/episodes/a/</loc></url><url><loc>https://koponpodcast.com/episodes/b/</loc></url>');
    posts.push(JSON.parse(init.body).urlList); return new Response('', { status: answer });
  };
  const live = { builtAt: '2026-10-28T10:00:00Z', indexNow: ['https://koponpodcast.com/', 'https://koponpodcast.com/episodes/new/'] };
  const r1 = await indexNowForLiveBuild({ live, siteUrl: 'https://koponpodcast.com', store, fetchImpl, log: () => {} });
  assert.equal(r1.sent, 4, 'first time: changed pages + the whole sitemap, without repeats');
  assert.deepEqual(await indexNowForLiveBuild({ live, siteUrl: 'https://koponpodcast.com', store, fetchImpl, log: () => {} }), { skipped: 'already sent' });
  answer = 429;
  const live2 = { builtAt: '2026-10-29T10:00:00Z', indexNow: ['https://koponpodcast.com/stats/'] };
  await indexNowForLiveBuild({ live: live2, siteUrl: 'https://koponpodcast.com', store, fetchImpl, log: () => {} });
  answer = 200;
  const r3 = await indexNowForLiveBuild({ live: live2, siteUrl: 'https://koponpodcast.com', store, fetchImpl, log: () => {} });
  assert.equal(r3.sent, 1, 'tried again after "too many requests", only the changed page');
  assert.equal(posts.length, 3);
  answer = 403;
  const live3 = { builtAt: '2026-10-30T10:00:00Z', indexNow: ['https://koponpodcast.com/news/'] };
  await indexNowForLiveBuild({ live: live3, siteUrl: 'https://koponpodcast.com', store, fetchImpl, log: () => {} });
  assert.deepEqual(await indexNowForLiveBuild({ live: live3, siteUrl: 'https://koponpodcast.com', store, fetchImpl, log: () => {} }), { skipped: 'already sent' }, 'a refusal is not retried forever');
});

test('the scheduled check hands the live build to the IndexNow step, with or without a build hook', async () => {
  const live = { builtAt: 'b1', signature: 's', latestGuid: 'g', count: 1 };
  const fetchImpl = async (u) => (String(u).includes('site-status') ? new Response(JSON.stringify(live)) : new Response('feed'));
  const seen = [];
  const base = { feedUrl: 'https://feed', siteUrl: 'https://koponpodcast.com', fetchImpl, parseFeed: () => ({ episodes: [{ guid: 'g', title: 'T', date: new Date('2026-10-01') }], signature: 's' }), now: new Date('2026-10-28T10:30:00Z'), log: () => {}, afterLive: async (l) => seen.push(l.builtAt) };
  await runScheduledCheck({ ...base, hookUrl: 'https://api.netlify.com/build_hooks/x' });
  await runScheduledCheck({ ...base, hookUrl: '' });
  assert.deepEqual(seen, ['b1', 'b1']);
  // a failing IndexNow step never stops the rebuild check
  const r = await runScheduledCheck({ ...base, hookUrl: 'https://api.netlify.com/build_hooks/x', afterLive: async () => { throw new Error('boom'); } });
  assert.match(r.reason, /Daily refresh/, 'the rebuild decision is still made');
});
